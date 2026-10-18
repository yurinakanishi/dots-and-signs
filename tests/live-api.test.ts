import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it, expect, vi } from 'vitest';
import { createApiHandler } from '../server/api';

const offer = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
function io(
  body: unknown = { sdp: offer },
  extra: Record<string, string> = {},
  url = '/api/live/session',
  method = 'POST',
) {
  const req = Object.assign(
    Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]),
    {
      url,
      method,
      headers: {
        host: '127.0.0.1:5173',
        origin: 'http://127.0.0.1:5173',
        'content-type': 'application/json',
        ...extra,
      },
    },
  ) as unknown as IncomingMessage;
  const res = Object.assign(new EventEmitter(), {
    status: 0,
    body: '',
    headers: {} as Record<string, unknown>,
    destroyed: false,
    writableEnded: false,
    setHeader(key: string, value: unknown) {
      this.headers[key] = value;
    },
    writeHead(code: number, headers = {}) {
      this.status = code;
      Object.assign(this.headers, headers);
      return this;
    },
    end(data = '') {
      this.body = data;
      this.writableEnded = true;
      return this;
    },
  });
  return { req, res, response: res as unknown as ServerResponse };
}
function handler(options: Partial<Parameters<typeof createApiHandler>[0]> = {}) {
  const upstream = vi.fn(async () =>
    Response.json(
      {
        session: { id: 'live_opaque' },
        transport: { type: 'webrtc', sdp: 'answer' },
        secret: 'must not be forwarded',
      },
      { status: 201 },
    ),
  );
  return {
    run: createApiHandler({
      port: 5173,
      apiKey: 'test-only-key',
      reserveSession: async () => 'allowed',
      fetch: upstream as typeof fetch,
      ...options,
    }),
    upstream,
  };
}
describe('local Live API boundary', () => {
  it('uses the server key and pinned models; forwards only ID and SDP', async () => {
    const h = handler(),
      { req, res, response } = io({ sdp: offer, session: { model: 'untrusted' } });
    await h.run(req, response);
    expect(res.status).toBe(201);
    expect(JSON.parse(res.body)).toEqual({
      session: { id: 'live_opaque' },
      transport: { type: 'webrtc', sdp: 'answer' },
    });
    const args = h.upstream.mock.calls as unknown as [string, RequestInit][];
    expect(args[0][0]).toBe('https://api.openai.com/v1/live/sessions');
    const sent = JSON.parse(args[0][1].body as string);
    expect(sent.session).toMatchObject({
      model: 'gpt-live-1',
      store: false,
      delegation: { type: 'decisions', decisions: { model: 'gpt-6-luna' } },
    });
    expect(
      sent.session.delegation.decisions.questions[0].choices.map((c: { value: string }) => c.value),
    ).toEqual(['hello', 'evening', 'thanks', 'welcome', 'none', 'unclear']);
    expect(sent.session.instructions).toContain('「OpenAI」の指文字は確認中');
    expect(res.body).not.toContain('test-only-key');
    expect(res.body).not.toContain('secret');
  });
  it.each<Record<string, string>>([
    { origin: 'https://evil.example' },
    { origin: '' },
    { host: 'evil.example' },
    { origin: 'http://localhost:5173' },
  ])('rejects untrusted host/origin %j before upstream', async (headers) => {
    const h = handler(),
      { req, res, response } = io(undefined, headers);
    await h.run(req, response);
    expect(res.status).toBe(403);
    expect(h.upstream).not.toHaveBeenCalled();
  });
  it.each([
    ['malformed', 400],
    [{ sdp: 'invalid' }, 400],
    [{ sdp: offer + 'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }, 400],
    ['x'.repeat(65537), 413],
  ])('rejects invalid/oversized SDP input', async (body, status) => {
    const h = handler(),
      { req, res, response } = io(body);
    await h.run(req, response);
    expect(res.status).toBe(status);
    expect(h.upstream).not.toHaveBeenCalled();
  });
  it('keeps missing-key setup local and reports status without exposing secrets', async () => {
    const h = handler({ apiKey: undefined }),
      post = io();
    await h.run(post.req, post.response);
    expect(post.res.status).toBe(503);
    const get = io('', {}, '/api/live/status', 'GET');
    await h.run(get.req, get.response);
    expect(JSON.parse(get.res.body).configured).toBe(false);
    expect(h.upstream).not.toHaveBeenCalled();
  });
  it('masks provider errors while preserving a safe status classification', async () => {
    const h = handler({
      fetch: vi.fn(async () =>
        Response.json({ error: { message: 'sk-secret SDP blah' } }, { status: 403 }),
      ) as typeof fetch,
    });
    const request = io();
    await h.run(request.req, request.response);
    expect(request.res.status).toBe(502);
    expect(request.res.body).toContain('利用権限');
    expect(request.res.body).not.toContain('sk-secret');
  });
  it('limits session creation to five attempts per minute', async () => {
    let time = 0;
    const h = handler({ now: () => time });
    for (let i = 0; i < 5; i++) {
      const r = io();
      await h.run(r.req, r.response);
      expect(r.res.status).toBe(201);
    }
    const blocked = io();
    await h.run(blocked.req, blocked.response);
    expect(blocked.res.status).toBe(429);
    time = 60_001;
    const next = io();
    await h.run(next.req, next.response);
    expect(next.res.status).toBe(201);
  });
  it('rejects invalid provider response shape', async () => {
    const h = handler({
      fetch: vi.fn(async () => Response.json({ token: 'secret' })) as typeof fetch,
    });
    const r = io();
    await h.run(r.req, r.response);
    expect(r.res.status).toBe(502);
    expect(r.res.body).not.toContain('secret');
  });
  it.each(['limit', 'unavailable'] as const)(
    'never calls the paid API when allowance is %s',
    async (allowance) => {
      const h = handler({ reserveSession: async () => allowance }),
        r = io();
      await h.run(r.req, r.response);
      expect(r.res.status).toBe(allowance === 'limit' ? 429 : 503);
      expect(h.upstream).not.toHaveBeenCalled();
    },
  );
});
