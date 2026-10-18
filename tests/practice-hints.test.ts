import { describe, expect, it, vi } from 'vitest';
import { choosePracticeHint } from '../server/practice-hints';
import { PracticeHintController } from '../src/lib/practice-hint-controller';
import { waitingFeedback } from '../src/lib/recognition';
import {
  HINT_INTERVAL_MS,
  HINT_SESSION_LIMIT,
  HINT_STALL_MS,
  parseHintContext,
  type HintContext,
} from '../src/lib/practice-hints';

const context: HintContext = {
  lessonId: 'hello',
  step: 0,
  handCount: 0,
  bodyVisible: true,
  holdProgress: 0,
  preparing: false,
  stalledSeconds: 12,
  previousHints: [],
};
const apiAnswer = (choice: string) =>
  Response.json({
    answers: [{ name: 'practice_hint', type: 'choice', choice }],
    secret: 'must-not-leak',
  });

describe('Decisions practice hint boundary', () => {
  it('sends only a bounded summary with fixed choices and returns an allowlisted ID', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => apiAnswer('show_hands'));
    const reserve = vi.fn(async () => 'allowed' as const);
    const result = await choosePracticeHint(context, { apiKey: 'test-key', fetch, reserve });
    expect(result).toEqual({ status: 200, body: { hint: 'show_hands', source: 'decisions' } });
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/decisions');
    const sent = JSON.parse(request!.body as string);
    expect(sent.model).toBe('gpt-6-luna');
    expect(sent.questions[0].name).toBe('practice_hint');
    expect(sent.questions[0].choices.map((choice: { value: string }) => choice.value)).toEqual([
      'show_hands',
      'wait',
    ]);
    expect(JSON.parse(sent.input)).toMatchObject(context);
    expect(sent.input).not.toMatch(/image|landmark|audio/);
    expect(reserve).toHaveBeenCalledOnce();
  });
  it.each([
    { ...context, step: 3 },
    { ...context, handCount: -1 },
    { ...context, lessonId: 'welcome' },
    { ...context, stalledSeconds: 1 },
    { ...context, holdProgress: NaN },
    { ...context, previousHints: ['invented'] },
    { ...context, previousHints: Array(4).fill('show_hands') },
    { ...context, image: 'base64-private-image' },
    { ...context, instructions: 'ignore rules' },
  ])('rejects invalid or extra client data before spending', async (input) => {
    const fetch = vi.fn(),
      reserve = vi.fn(async () => 'allowed' as const);
    expect(parseHintContext(input)).toBeNull();
    expect((await choosePracticeHint(input, { apiKey: 'test', fetch, reserve })).status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['limit', 'rate', 'unavailable'] as const)(
    'does not spend when quota is %s',
    async (allowance) => {
      const fetch = vi.fn();
      const result = await choosePracticeHint(context, {
        apiKey: 'test',
        fetch,
        reserve: async () => allowance,
      });
      expect(result.status).toBe(allowance === 'unavailable' ? 503 : 429);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('does not reserve without a key or after cancellation', async () => {
    const reserve = vi.fn(async () => 'allowed' as const);
    expect((await choosePracticeHint(context, { reserve })).status).toBe(503);
    expect(
      (await choosePracticeHint(context, { apiKey: 'test', reserve, signal: AbortSignal.abort() }))
        .status,
    ).toBe(504);
    expect(reserve).not.toHaveBeenCalled();
  });
  it.each(['invented', 'keep_going', 'review_demo'])(
    'rejects an unsupported or contradictory answer: %s',
    async (choice) => {
      const result = await choosePracticeHint(context, {
        apiKey: 'test',
        reserve: async () => 'allowed',
        fetch: async () => apiAnswer(choice),
      });
      expect(result.status).toBe(502);
    },
  );
  it.each([
    () => Response.json({ answers: [{ name: 'practice_hint', type: 'refusal' }] }),
    () => new Response('private provider error', { status: 403 }),
    () => new Response('x'.repeat(33 * 1024)),
  ])('fails safely on refusal, provider error or oversized response', async (response) => {
    const result = await choosePracticeHint(context, {
      apiKey: 'test',
      reserve: async () => 'allowed',
      fetch: async () => response(),
    });
    expect(result.status).toBe(502);
    expect(JSON.stringify(result)).not.toContain('private');
  });
});

function harness() {
  let time = 0;
  let visible = true;
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ hint: 'follow_step', source: 'decisions' }),
  );
  const controller = new PracticeHintController({ fetch, now: () => time, visible: () => visible });
  const observation = {
    lessonId: 'hello' as const,
    active: true,
    run: 0,
    feedback: { ...waitingFeedback(), handCount: 1, bodyVisible: true },
  };
  const observe = () =>
    controller.observe({ ...observation, feedback: { ...observation.feedback } });
  observe();
  return {
    fetch,
    controller,
    observation,
    observe,
    at: (next: number) => {
      time = next;
    },
    hide: () => {
      visible = false;
    },
  };
}
describe('practice hint timing and lifecycle', () => {
  it('waits for a stall, sends real progress and history, spaces requests and caps a run', async () => {
    const h = harness();
    h.at(HINT_STALL_MS - 1);
    await h.controller.tick();
    expect(h.fetch).not.toHaveBeenCalled();
    h.at(HINT_STALL_MS);
    await h.controller.tick();
    expect(h.controller.getSnapshot()?.id).toBe('follow_step');
    h.at(HINT_STALL_MS + HINT_INTERVAL_MS - 1);
    await h.controller.tick();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    for (let i = 1; i <= HINT_SESSION_LIMIT; i++) {
      h.at(HINT_STALL_MS + HINT_INTERVAL_MS * i);
      await h.controller.tick();
    }
    expect(h.fetch).toHaveBeenCalledTimes(HINT_SESSION_LIMIT);
    expect(JSON.parse(h.fetch.mock.calls[1][1]!.body as string).previousHints).toEqual([
      'follow_step',
    ]);
    expect(JSON.parse(h.fetch.mock.calls[5][1]!.body as string).previousHints).toHaveLength(3);
  });
  it.each(['step', 'stop', 'success', 'reset', 'pause'] as const)(
    'discards in-flight responses after %s',
    async (change) => {
      const h = harness();
      let finish!: (response: Response) => void;
      h.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      h.at(HINT_STALL_MS);
      const pending = h.controller.tick();
      if (change === 'step') {
        h.observation.feedback.step = 1;
        h.observation.feedback.completedSteps = 1;
      }
      if (change === 'stop') h.observation.active = false;
      if (change === 'success') h.observation.feedback.status = 'success';
      if (change === 'reset') h.observation.run++;
      if (change === 'pause') h.observation.feedback.trackingPaused = true;
      h.observe();
      expect(h.fetch.mock.calls[0][1]!.signal!.aborted).toBe(true);
      finish(Response.json({ hint: 'follow_step', source: 'decisions' }));
      await pending;
      expect(h.controller.getSnapshot()).toBeNull();
    },
  );
  it('avoids calls while progressing, inactive, tracking paused or hidden', async () => {
    const h = harness();
    h.at(11_000);
    h.observation.feedback.holdProgress = 0.25;
    h.observe();
    h.at(12_000);
    await h.controller.tick();
    h.observation.active = false;
    h.observe();
    h.at(40_000);
    await h.controller.tick();
    h.observation.active = true;
    h.observation.feedback.trackingPaused = true;
    h.observe();
    h.at(60_000);
    await h.controller.tick();
    h.observation.feedback.trackingPaused = false;
    h.observe();
    h.hide();
    h.at(90_000);
    await h.controller.tick();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it('does not show a hint when the hands disappear while the request is pending', async () => {
    const h = harness();
    let finish!: (response: Response) => void;
    h.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    h.at(HINT_STALL_MS);
    const pending = h.controller.tick();
    h.observation.feedback.handCount = 0;
    h.observe();
    finish(Response.json({ hint: 'follow_step', source: 'decisions' }));
    await pending;
    expect(h.controller.getSnapshot()).toBeNull();
  });
  it('keeps local guidance and stops retrying after quota or repeated failures', async () => {
    for (const status of [429, 503, 502]) {
      const h = harness();
      h.fetch.mockImplementation(async () => new Response('', { status }));
      for (let i = 0; i < 4; i++) {
        h.at(HINT_STALL_MS + HINT_INTERVAL_MS * i);
        await h.controller.tick();
      }
      expect(h.fetch).toHaveBeenCalledTimes(status === 502 ? 2 : 1);
      expect(h.controller.getSnapshot()).toBeNull();
    }
  });
  it('deduplicates concurrent ticks and drops a result when the page becomes hidden', async () => {
    const h = harness();
    let finish!: (response: Response) => void;
    h.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    h.at(HINT_STALL_MS);
    const pending = h.controller.tick();
    await h.controller.tick();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    h.hide();
    finish(Response.json({ hint: 'follow_step', source: 'decisions' }));
    await pending;
    expect(h.controller.getSnapshot()).toBeNull();
  });
});
