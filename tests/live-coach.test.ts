import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveCoach } from '../src/lib/live/coach';

function harness(
  options: {
    configured?: boolean;
    microphone?: () => Promise<MediaStream>;
    remoteError?: number;
  } = {},
) {
  const track = { stop: vi.fn(), enabled: true, addEventListener: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  const channel = {
    readyState: 'open',
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null as (() => void) | null,
    onerror: null,
    close: vi.fn(),
    send: vi.fn(),
  };
  const peer = {
    localDescription: { sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
    iceGatheringState: 'complete',
    connectionState: 'connected',
    ontrack: null,
    onconnectionstatechange: null as (() => void) | null,
    addTrack: vi.fn(),
    createDataChannel: vi.fn(() => channel),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'offer' })),
    setLocalDescription: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {}),
    close: vi.fn(),
  };
  const audio = { autoplay: false, srcObject: null, play: vi.fn(async () => {}), pause: vi.fn() };
  const apply = vi.fn();
  const getMicrophone = vi.fn(options.microphone ?? (async () => stream));
  const request = vi.fn(async (url: RequestInfo | URL) =>
    url === '/api/live/status'
      ? Response.json({ configured: options.configured ?? true })
      : options.remoteError
        ? Response.json(
            { error: 'APIの利用上限または残高を確認してください。' },
            { status: options.remoteError },
          )
        : Response.json(
            { session: { id: 'live_test' }, transport: { type: 'webrtc', sdp: 'answer' } },
            { status: 201 },
          ),
  );
  const coach = new LiveCoach(apply, {
    fetch: request as typeof fetch,
    getMicrophone,
    createPeer: () => peer as unknown as RTCPeerConnection,
    createAudio: () => audio as unknown as HTMLAudioElement,
  });
  const emit = (data: unknown) => channel.onmessage?.({ data: JSON.stringify(data) });
  const ready = async () => {
    await coach.start();
    emit({ type: 'session.started', session: { id: 'live_test' } });
  };
  const created = (id: string) => emit({ type: 'session.delegation.created', delegation: { id } });
  const decide = (id: string, choice: unknown) =>
    emit({
      type: 'decision.event',
      delegation_id: id,
      event: {
        type: 'decision.completed',
        decision: { answers: [{ type: 'choice', name: 'lesson_id', choice }] },
      },
    });
  const sent = () => channel.send.mock.calls.map((args) => JSON.parse(args[0] as string));
  return {
    coach,
    track,
    stream,
    channel,
    peer,
    audio,
    apply,
    getMicrophone,
    request,
    emit,
    ready,
    created,
    decide,
    sent,
  };
}
const active: LiveCoach[] = [];
function setup(options?: Parameters<typeof harness>[0]) {
  const h = harness(options);
  active.push(h.coach);
  return h;
}
afterEach(() => {
  active.splice(0).forEach((c) => c.dispose());
  vi.useRealTimers();
});

describe('Live coach transport and application contract', () => {
  it('waits for session.started; only audio is attached and no session.start is sent', async () => {
    const h = setup();
    await h.coach.start();
    expect(h.coach.getSnapshot().state).toBe('connecting');
    expect(h.peer.createDataChannel).toHaveBeenCalledWith('oai-events');
    expect(h.peer.addTrack).toHaveBeenCalledWith(h.track, h.stream);
    expect(h.sent()).toEqual([]);
    h.emit({ type: 'session.started', session: { id: 'live_test' } });
    expect(h.coach.getSnapshot().state).toBe('listening');
  });
  it('does not request the microphone when the API is not configured', async () => {
    const h = setup({ configured: false });
    await h.coach.start();
    expect(h.coach.getSnapshot().state).toBe('error');
    expect(h.getMicrophone).not.toHaveBeenCalled();
  });
  it('handles service errors before session.started without waiting for timeout', async () => {
    const h = setup();
    await h.coach.start();
    h.emit({ type: 'error' });
    expect(h.coach.getSnapshot().state).toBe('error');
    expect(h.track.stop).toHaveBeenCalled();
  });
  it('finishes failed decisions once and keeps the current lesson', async () => {
    const h = setup();
    await h.ready();
    h.created('d1');
    h.emit({ type: 'decision.event', delegation_id: 'd1', event: { type: 'decision.failed' } });
    h.decide('d1', 'thanks');
    expect(h.coach.getSnapshot().recommendedLessonId).toBeNull();
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.sent()).toHaveLength(1);
    expect(h.sent()[0].delegation_id).toBe('d1');
  });
  it('gives an actionable microphone refusal and makes no paid session request', async () => {
    const h = setup({
      microphone: async () => {
        throw new DOMException('refused', 'NotAllowedError');
      },
    });
    await h.coach.start();
    expect(h.coach.getSnapshot().error).toContain('マイクが許可されていません');
    expect(h.request).toHaveBeenCalledTimes(1);
  });
  it('releases a late microphone grant after cancellation', async () => {
    let grant!: (s: MediaStream) => void;
    const h = setup({
      microphone: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    });
    const start = h.coach.start();
    await vi.waitFor(() => expect(h.getMicrophone).toHaveBeenCalled());
    h.coach.stop();
    grant(h.stream);
    await start;
    expect(h.track.stop).toHaveBeenCalled();
    expect(h.peer.createOffer).not.toHaveBeenCalled();
    expect(h.coach.getSnapshot().state).toBe('idle');
  });
  it('preserves provider failure guidance and releases devices', async () => {
    const h = setup({ remoteError: 429 });
    await h.coach.start();
    expect(h.coach.getSnapshot().error).toContain('利用上限');
    expect(h.track.stop).toHaveBeenCalled();
    expect(h.peer.close).toHaveBeenCalled();
  });
  it('proposes only; waits for both user confirmation and committed UI before reporting success', async () => {
    const h = setup();
    await h.ready();
    h.created('d1');
    h.decide('d1', 'thanks');
    expect(h.coach.getSnapshot().recommendedLessonId).toBe('thanks');
    expect(h.apply).not.toHaveBeenCalled();
    h.coach.confirmLesson('evening');
    expect(h.apply).not.toHaveBeenCalled();
    h.coach.confirmLesson('thanks');
    h.coach.confirmLesson('thanks');
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('thanks');
    expect(h.sent().filter((e) => e.content?.includes('実際に表示'))).toHaveLength(0);
    h.coach.reportDisplayedLesson('thanks');
    expect(h.sent().at(-1)).toMatchObject({
      type: 'session.commentary.append',
      delegation_id: 'd1',
    });
    expect(h.sent().at(-1).content).toContain('実際に表示');
    expect(h.coach.getSnapshot().recommendedLessonId).toBeNull();
  });
  it('acknowledges confirming the already displayed lesson without resetting practice', async () => {
    const h = setup();
    await h.ready();
    h.created('d1');
    h.decide('d1', 'hello');
    h.coach.confirmLesson('hello');
    h.coach.reportDisplayedLesson('hello');
    expect(h.sent().at(-1).content).toContain('実際に表示');
  });
  it('confirms the fourth image lesson and reports its limited scope to the coach', async () => {
    const h = setup();
    await h.ready();
    h.created('welcome-1');
    h.decide('welcome-1', 'welcome');
    expect(h.coach.getSnapshot().recommendedLessonId).toBe('welcome');
    expect(h.apply).not.toHaveBeenCalled();
    h.coach.confirmLesson('welcome');
    h.coach.reportDisplayedLesson('welcome');
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('welcome');
    expect(h.sent().at(-1)).toMatchObject({ delegation_id: 'welcome-1' });
    expect(h.sent().at(-1).content).toContain('「OpenAI」の指文字は確認中');
    expect(h.sent().at(-1).content).toContain('自動判定はありません');
  });
  it('returns unsupported to the same delegation and never invents a lesson', async () => {
    const h = setup();
    await h.ready();
    h.created('d1');
    h.decide('d1', 'none');
    expect(h.coach.getSnapshot().recommendedLessonId).toBe('none');
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.sent().at(-1)).toMatchObject({ delegation_id: 'd1' });
    expect(h.sent().at(-1).content).toContain('教材化していません');
  });
  it('asks for clarification without claiming that a lesson is unavailable', async () => {
    const h = setup();
    await h.ready();
    h.created('first');
    h.decide('first', 'hello');
    h.created('uncertain');
    h.decide('uncertain', 'unclear');
    expect(h.coach.getSnapshot().recommendedLessonId).toBe('unclear');
    expect(h.sent().at(-1)).toMatchObject({ delegation_id: 'uncertain' });
    expect(h.sent().at(-1).content).toContain('もう一度1つだけ');
    expect(h.sent().at(-1).content).not.toContain('教材化していません');
    h.coach.confirmLesson('hello');
    expect(h.apply).not.toHaveBeenCalled();
    h.created('retry');
    h.decide('retry', 'hello');
    h.coach.confirmLesson('hello');
    h.coach.reportDisplayedLesson('hello');
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('hello');
    expect(h.sent().at(-1)).toMatchObject({ delegation_id: 'retry' });
  });
  it('ignores old, duplicate, uncorrelated and transcript-trigger decisions', async () => {
    const h = setup();
    await h.ready();
    h.decide('unknown', 'thanks');
    h.created('d1');
    h.created('d2');
    h.decide('d1', 'hello');
    h.decide('d2', 'evening');
    h.decide('d2', 'thanks');
    h.created('d1');
    h.emit({
      type: 'decision.event',
      delegation_id: null,
      trigger_id: 'x',
      event: {
        type: 'decision.completed',
        decision: { answers: [{ type: 'choice', name: 'lesson_id', choice: 'thanks' }] },
      },
    });
    expect(h.coach.getSnapshot().recommendedLessonId).toBe('evening');
    expect(h.sent()).toHaveLength(1);
  });
  it('rejects unexpected choices and invalid answer shapes', async () => {
    const h = setup();
    await h.ready();
    h.created('d1');
    h.decide('d1', 'reception');
    expect(h.coach.getSnapshot().recommendedLessonId).toBeNull();
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.coach.getSnapshot().notice).toContain('選べません');
  });
  it('manual selection invalidates a pending decision', async () => {
    const h = setup();
    await h.ready();
    h.created('d1');
    h.coach.reportDisplayedLesson('evening');
    h.decide('d1', 'thanks');
    expect(h.coach.getSnapshot().recommendedLessonId).toBeNull();
  });
  it('reselecting the current lesson manually also invalidates an unfinished decision', async () => {
    const h = setup();
    await h.ready();
    h.created('d1');
    h.coach.selectLessonManually('hello');
    h.decide('d1', 'thanks');
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('hello');
    expect(h.coach.getSnapshot().recommendedLessonId).toBeNull();
  });
  it('preserves exact transcript fragments, timing, speaker and repeats; deduplicates events', async () => {
    const h = setup();
    await h.ready();
    h.emit({
      type: 'session.input_transcript.delta',
      event_id: 'b',
      delta: 'ありがとう',
      start_ms: 100,
      end_ms: 200,
    });
    h.emit({
      type: 'session.output_transcript.delta',
      event_id: 'c',
      delta: 'はい',
      start_ms: 50,
      end_ms: 150,
    });
    h.emit({
      type: 'session.input_transcript.delta',
      event_id: 'a',
      delta: 'ありがとう ',
      start_ms: 0,
      end_ms: 100,
    });
    h.emit({
      type: 'session.input_transcript.delta',
      event_id: 'b',
      delta: 'ありがとう',
      start_ms: 100,
      end_ms: 200,
    });
    expect(h.coach.getSnapshot().inputTranscript).toBe('ありがとう ありがとう');
    expect(h.coach.getSnapshot().outputTranscript).toBe('はい');
    expect(h.coach.getSnapshot().fragments).toHaveLength(3);
    expect(h.coach.getSnapshot().fragments[0]).toMatchObject({
      startMs: 100,
      endMs: 200,
      speaker: 'user',
    });
  });
  it('sends close and waits for finalization before releasing the transport', async () => {
    const h = setup();
    await h.ready();
    h.coach.stop();
    expect(h.sent().at(-1).type).toBe('session.close');
    expect(h.coach.getSnapshot().stopping).toBe(true);
    expect(h.track.enabled).toBe(false);
    expect(h.audio.pause).toHaveBeenCalled();
    expect(h.peer.close).not.toHaveBeenCalled();
    h.emit({ type: 'session.closed', usage: { seconds: 12 } });
    expect(h.track.stop).toHaveBeenCalled();
    expect(h.coach.getSnapshot()).toMatchObject({ state: 'idle', finalized: true, seconds: 12 });
  });
  it('switches to manual selection while closing without reviving audio or stale recommendations', async () => {
    const h = setup();
    await h.ready();
    h.created('pending');
    h.decide('pending', 'thanks');
    h.coach.stop();
    const sentCount = h.sent().length;
    h.coach.selectLessonManually('welcome');
    h.coach.reportDisplayedLesson('welcome');
    h.decide('pending', 'thanks');
    h.coach.confirmLesson('thanks');
    await h.coach.resumeAudio();
    expect(h.audio.play).not.toHaveBeenCalled();
    expect(h.sent()).toHaveLength(sentCount);
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('welcome');
    expect(h.coach.getSnapshot().recommendedLessonId).toBeNull();
    h.emit({ type: 'session.closed' });
    expect(h.coach.getSnapshot()).toMatchObject({ state: 'idle', finalized: true, error: '' });
    expect(h.request).toHaveBeenCalledTimes(2);
  });
  it('bounds shutdown even without final session.closed', async () => {
    vi.useFakeTimers();
    const h = setup();
    await h.ready();
    h.coach.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.track.stop).toHaveBeenCalled();
    expect(h.coach.getSnapshot().finalized).toBe(false);
    expect(h.coach.getSnapshot().notice).toContain('終了応答');
  });
  it('drains cancelled commentary errors during close until session.closed arrives', async () => {
    const h = setup();
    await h.ready();
    h.coach.stop();
    h.emit({ type: 'error', error: { code: 'context_injection_incomplete' } });
    expect(h.peer.close).not.toHaveBeenCalled();
    expect(h.coach.getSnapshot().stopping).toBe(true);
    h.emit({ type: 'session.closed', usage: { seconds: 20 } });
    expect(h.coach.getSnapshot()).toMatchObject({ state: 'idle', finalized: true, error: '' });
  });
  it('bounds initial connection and stops a 1 minute session', async () => {
    vi.useFakeTimers();
    const h = setup();
    await h.coach.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.coach.getSnapshot().state).toBe('error');
    await h.ready();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.coach.getSnapshot().stopping).toBe(true);
    expect(h.sent().at(-1).type).toBe('session.close');
  });
  it('cleans up on network disconnect and never applies a stale callback after reconnect', async () => {
    const h = setup();
    await h.ready();
    const oldHandler = h.channel.onmessage;
    h.peer.connectionState = 'failed';
    h.peer.onconnectionstatechange?.();
    expect(h.coach.getSnapshot().state).toBe('error');
    expect(h.track.stop).toHaveBeenCalled();
    await h.ready();
    oldHandler?.({ data: JSON.stringify({ type: 'error' }) });
    expect(h.coach.getSnapshot().state).toBe('listening');
  });
});
