import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleHostedApi, type HostedEnv } from '../server/hosted-api';
import {
  reserveHostedHint,
  reserveHostedSession,
  CONNECTION_INTERVAL_MS,
} from '../server/hosted-usage';
import { HINT_DAILY_LIMIT, HINT_INTERVAL_MS } from '../src/lib/practice-hints';

const origin = 'https://practice-signs-with-dots.yurinakanishi33.chatgpt.site';
const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const initialTime = Date.parse('2026-10-18T08:00:00Z');
const databases: DatabaseSync[] = [];
afterEach(() => {
  databases.splice(0).forEach((db) => db.close());
});
function environment(): HostedEnv {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  for (const name of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  }
  return {
    OPENAI_API_KEY: 'test-only-key',
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: SQLInputValue[]) {
            return {
              async first() {
                return sqlite.prepare(sql).get(...values) ?? null;
              },
            };
          },
        };
      },
    } as Pick<D1Database, 'prepare'>,
  };
}
function request(body: unknown = { sdp }, headers: Record<string, string> = {}) {
  return new Request(origin + '/api/live/session', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
function upstream() {
  return vi.fn<typeof fetch>(async () =>
    Response.json({
      session: { id: 'test-session', secret: 'must-not-leak' },
      transport: { type: 'webrtc', sdp: 'answer' },
      apiKey: 'must-not-leak',
    }),
  );
}

describe('hosted durable quota', () => {
  it('allows only one concurrent reservation across fresh handler instances', async () => {
    const env = environment();
    const results = await Promise.all(
      Array.from({ length: 30 }, () => reserveHostedSession(env, initialTime)),
    );
    expect(results.filter((x) => x === 'allowed')).toHaveLength(1);
    expect(results.filter((x) => x === 'rate')).toHaveLength(29);
  });
  it('keeps the daily cap across requests and rolls over at 09:00 JST', async () => {
    const env = environment();
    for (let i = 0; i < 10; i++)
      expect(await reserveHostedSession(env, initialTime + i * CONNECTION_INTERVAL_MS)).toBe(
        'allowed',
      );
    expect(await reserveHostedSession(env, initialTime + 11 * CONNECTION_INTERVAL_MS)).toBe(
      'limit',
    );
    expect(await reserveHostedSession(env, Date.parse('2026-10-19T00:00:00Z'))).toBe('allowed');
  });
  it('carries forward earlier local attempts without overwriting hosted usage', async () => {
    const env = {
      ...environment(),
      LIVE_INITIAL_USAGE_DAY: '2026-10-18',
      LIVE_INITIAL_USAGE_COUNT: '8',
    };
    expect(await reserveHostedSession(env, initialTime)).toBe('allowed');
    expect(await reserveHostedSession(env, initialTime + CONNECTION_INTERVAL_MS)).toBe('allowed');
    expect(await reserveHostedSession(env, initialTime + 2 * CONNECTION_INTERVAL_MS)).toBe('limit');
  });
  it('blocks an already exhausted initial quota and malformed settings', async () => {
    const env = environment();
    expect(
      await reserveHostedSession(
        { ...env, LIVE_INITIAL_USAGE_DAY: '2026-10-18', LIVE_INITIAL_USAGE_COUNT: '10' },
        initialTime,
      ),
    ).toBe('limit');
    expect(await reserveHostedSession({ ...env, LIVE_INITIAL_USAGE_COUNT: '2' }, initialTime)).toBe(
      'unavailable',
    );
    expect(
      await reserveHostedSession(
        { ...env, LIVE_INITIAL_USAGE_DAY: '2026-10-18', LIVE_INITIAL_USAGE_COUNT: 'NaN' },
        initialTime,
      ),
    ).toBe('unavailable');
  });
  it('fails closed on missing database or a database error', async () => {
    expect(await reserveHostedSession({})).toBe('unavailable');
    expect(
      await reserveHostedSession({
        DB: {
          prepare() {
            throw new Error('database down');
          },
        },
      }),
    ).toBe('unavailable');
  });
});

describe('hosted practice hints', () => {
  const body = {
    lessonId: 'hello',
    step: 0,
    handCount: 0,
    bodyVisible: true,
    holdProgress: 0,
    preparing: false,
    stalledSeconds: 12,
    previousHints: [],
  };
  const hintRequest = (value: unknown = body, headers: Record<string, string> = {}) =>
    new Request(origin + '/api/practice/hint', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', ...headers },
      body: JSON.stringify(value),
    });
  it('routes to Decisions without opening a Live session or leaking provider fields', async () => {
    const env = environment();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        answers: [{ name: 'practice_hint', type: 'choice', choice: 'show_hands' }],
        secret: 'private',
      }),
    );
    const response = await handleHostedApi(hintRequest(), env, { fetch, now: () => initialTime });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hint: 'show_hands', source: 'decisions' });
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/decisions');
    expect(await reserveHostedSession(env, initialTime)).toBe('allowed');
    expect(
      (await handleHostedApi(hintRequest(), env, { fetch, now: () => initialTime })).status,
    ).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    [body, { origin: 'https://untrusted.example' }, 403],
    [body, { 'content-type': 'text/plain' }, 415],
    [{ ...body, image: 'private' }, {}, 400],
    ['x'.repeat(2049), {}, 413],
  ] as const)('rejects invalid requests before spending (%#)', async (value, headers, status) => {
    const fetch = vi.fn();
    const response = await handleHostedApi(hintRequest(value, headers), environment(), { fetch });
    expect(response.status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('enforces a separate durable cap and concurrent spacing across isolates', async () => {
    const env = environment();
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => reserveHostedHint(env, initialTime)),
    );
    expect(attempts.filter((value) => value === 'allowed')).toHaveLength(1);
    expect(attempts.filter((value) => value === 'rate')).toHaveLength(9);
    for (let i = 1; i < HINT_DAILY_LIMIT; i++)
      expect(await reserveHostedHint(env, initialTime + i * HINT_INTERVAL_MS)).toBe('allowed');
    expect(await reserveHostedHint(env, initialTime + HINT_DAILY_LIMIT * HINT_INTERVAL_MS)).toBe(
      'limit',
    );
    expect(await reserveHostedSession(env, initialTime)).toBe('allowed');
    expect(await reserveHostedHint(env, initialTime + 86_400_000)).toBe('allowed');
    expect(await reserveHostedHint({}, initialTime)).toBe('unavailable');
  });
});

describe('hosted voice boundary', () => {
  it('reports setup without spending or exposing the key', async () => {
    const env = environment();
    const response = await handleHostedApi(new Request(origin + '/api/live/status'), env);
    const body = await response.json();
    expect(body).toMatchObject({ configured: true, dailySessionLimit: 10, maxSessionSeconds: 60 });
    expect(JSON.stringify(body)).not.toContain(env.OPENAI_API_KEY);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each([
    [{ sdp }, { origin: 'https://untrusted.example' }, 403],
    [{ sdp }, { origin: '' }, 403],
    [{ sdp }, { 'content-type': 'text/plain' }, 415],
    [{ sdp: 'bad' }, {}, 400],
    [{ sdp: sdp + 'm=video 9 UDP/TLS/RTP/SAVPF 111\r\n' }, {}, 400],
    [{ sdp: sdp + 'x'.repeat(65_536) }, {}, 413],
  ] as const)('rejects invalid input before paid fetch (%#)', async (body, headers, status) => {
    const fetch = upstream();
    expect((await handleHostedApi(request(body, headers), environment(), { fetch })).status).toBe(
      status,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only server-owned config and returns only id and SDP', async () => {
    const fetch = upstream();
    const response = await handleHostedApi(
      request({ sdp, session: { model: 'attacker', instructions: 'bad' } }),
      environment(),
      { fetch, now: () => initialTime },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      session: { id: 'test-session' },
      transport: { type: 'webrtc', sdp: 'answer' },
    });
    const sent = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(sent.session.model).toBe('gpt-live-1');
    expect(sent.session.store).toBe(false);
    expect(sent.session.delegation.decisions.model).toBe('gpt-6-luna');
  });
  it('reserves a failed attempt and suppresses provider error details', async () => {
    const env = environment();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('secret diagnostic', { status: 403 }),
    );
    const response = await handleHostedApi(request(), env, { fetch, now: () => initialTime });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret diagnostic');
    expect((await handleHostedApi(request(), env, { fetch, now: () => initialTime })).status).toBe(
      429,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('never calls the paid API when configuration or quota storage is unavailable', async () => {
    const fetch = upstream();
    expect((await handleHostedApi(request(), {}, { fetch })).status).toBe(503);
    expect(
      (
        await handleHostedApi(
          request(),
          {
            OPENAI_API_KEY: 'test',
            DB: {
              prepare() {
                throw new Error();
              },
            },
          },
          { fetch },
        )
      ).status,
    ).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not spend after ten attempts', async () => {
    const env = {
      ...environment(),
      LIVE_INITIAL_USAGE_DAY: '2026-10-18',
      LIVE_INITIAL_USAGE_COUNT: '10',
    };
    const fetch = upstream();
    const response = await handleHostedApi(request(), env, { fetch, now: () => initialTime });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'daily_limit' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
