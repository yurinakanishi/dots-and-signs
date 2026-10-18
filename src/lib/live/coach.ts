import type { LessonId } from '../types';
import { isLessonId, lessonLabels as labels, lessonNames, lessons } from '../lessons';
import { MAX_SESSION_SECONDS } from './limits';

export type LessonChoice = LessonId | 'none' | 'unclear';
export type TranscriptFragment = {
  id: string;
  speaker: 'user' | 'coach';
  delta: string;
  startMs: number;
  endMs: number;
  order: number;
};
export type CoachSnapshot = {
  state: 'idle' | 'connecting' | 'listening' | 'error';
  stopping: boolean;
  inputTranscript: string;
  outputTranscript: string;
  fragments: TranscriptFragment[];
  recommendedLessonId: LessonChoice | null;
  awaitingDisplay: LessonId | null;
  error: string;
  notice: string;
  playbackBlocked: boolean;
  seconds: number;
  finalized: boolean;
};
type Dependencies = {
  fetch: typeof fetch;
  getMicrophone: () => Promise<MediaStream>;
  createPeer: () => RTCPeerConnection;
  createAudio: () => HTMLAudioElement;
};
const initial = (): CoachSnapshot => ({
  state: 'idle',
  stopping: false,
  inputTranscript: '',
  outputTranscript: '',
  fragments: [],
  recommendedLessonId: null,
  awaitingDisplay: null,
  error: '',
  notice: '',
  playbackBlocked: false,
  seconds: 0,
  finalized: false,
});
const isChoice = (value: unknown): value is LessonChoice =>
  value === 'none' || value === 'unclear' || isLessonId(value);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export class LiveCoach {
  private snapshot = initial();
  private listeners = new Set<() => void>();
  private deps: Dependencies;
  private applyLesson: (id: LessonId) => void;
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private microphone: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private abort: AbortController | null = null;
  private generation = 0;
  private sessionId = '';
  private ready = false;
  private latestDelegation = '';
  private pending: { id: LessonId; delegation: string } | null = null;
  private displayed: LessonId = 'hello';
  private seenEvents = new Set<string>();
  private seenDelegations = new Set<string>();
  private completedDecisions = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(applyLesson: (id: LessonId) => void, deps: Partial<Dependencies> = {}) {
    this.applyLesson = applyLesson;
    this.deps = {
      fetch: (...args) => fetch(...args),
      getMicrophone: () =>
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        }),
      createPeer: () => new RTCPeerConnection(),
      createAudio: () => new Audio(),
      ...deps,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<CoachSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }
  private clearTimer(timer: ReturnType<typeof setTimeout> | null) {
    if (timer !== null) {
      clearTimeout(timer);
      this.timers.delete(timer);
    }
  }
  private send(event: Record<string, unknown>) {
    if (!this.ready || this.channel?.readyState !== 'open') return false;
    try {
      this.channel.send(JSON.stringify({ event_id: crypto.randomUUID(), ...event }));
      return true;
    } catch {
      return false;
    }
  }
  private commentary(delegation: string, content: string) {
    if (!this.send({ type: 'session.commentary.append', delegation_id: delegation, content }))
      this.fail('音声コーチへの通知に失敗しました。もう一度接続してください。');
  }
  private release() {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.connectTimer = null;
    this.disconnectTimer = null;
    this.ready = false;
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = null;
    const channel = this.channel;
    this.channel = null;
    if (channel) {
      channel.onmessage = null;
      channel.onclose = null;
      channel.onerror = null;
      channel.close();
    }
    const peer = this.peer;
    this.peer = null;
    if (peer) {
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
      this.audio = null;
    }
    this.pending = null;
    this.latestDelegation = '';
    this.update({
      stopping: false,
      recommendedLessonId: null,
      awaitingDisplay: null,
      playbackBlocked: false,
    });
  }
  private fail(message: string) {
    this.send({ type: 'session.close' });
    this.release();
    this.update({ state: 'error', error: message, finalized: false });
  }
  start = async () => {
    if (
      this.snapshot.stopping ||
      this.snapshot.state === 'connecting' ||
      this.snapshot.state === 'listening'
    )
      return;
    this.release();
    this.snapshot = initial();
    this.seenEvents.clear();
    this.seenDelegations.clear();
    this.completedDecisions.clear();
    this.update({ state: 'connecting' });
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    const current = () => generation === this.generation;
    this.connectTimer = this.later(() => {
      if (current())
        this.fail('接続に時間がかかっています。マイクの許可とネットワークを確認してください。');
    }, 30_000);
    try {
      const statusResponse = await this.deps.fetch('/api/live/status', {
        signal: abort.signal,
        cache: 'no-store',
      });
      if (!statusResponse.ok)
        throw new Error('音声サーバーに接続できません。ローカルサーバーを確認してください。');
      let status: Record<string, unknown>;
      try {
        status = record(await statusResponse.json());
      } catch {
        throw new Error('音声サーバーがありません。手動で教材を選んで練習できます。');
      }
      if (!current()) return;
      if (status.configured !== true)
        throw new Error('音声アシストの接続設定がまだありません。手動で教材を選んで練習できます。');
      const microphone = await this.deps.getMicrophone();
      if (!current()) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      this.microphone = microphone;
      const peer = this.deps.createPeer();
      this.peer = peer;
      const audio = this.deps.createAudio();
      this.audio = audio;
      audio.autoplay = true;
      peer.ontrack = (event) => {
        if (!current() || this.snapshot.stopping) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(() => {
          if (current() && !this.snapshot.stopping) this.update({ playbackBlocked: true });
        });
      };
      peer.onconnectionstatechange = () => {
        if (!current() || this.snapshot.stopping) return;
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed')
          this.fail('音声の接続が切れました。練習の続きは残っています。');
        else if (peer.connectionState === 'disconnected' && this.disconnectTimer === null) {
          this.disconnectTimer = this.later(() => {
            if (current()) this.fail('音声の接続が途切れました。もう一度接続できます。');
          }, 4000);
        } else if (peer.connectionState === 'connected') {
          this.clearTimer(this.disconnectTimer);
          this.disconnectTimer = null;
        }
      };
      microphone.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (current() && !this.snapshot.stopping)
            this.fail('マイクが切断されました。接続を確認してください。');
        });
        peer.addTrack(track, microphone);
      });
      const channel = peer.createDataChannel('oai-events');
      this.channel = channel;
      channel.onmessage = ({ data }) => {
        if (!current() || typeof data !== 'string' || data.length > 131072) return;
        try {
          this.receive(JSON.parse(data));
        } catch {
          this.fail('音声サービスの応答を処理できませんでした。もう一度接続してください。');
        }
      };
      channel.onclose = () => {
        if (current()) this.fail('音声接続が終了しました。終了応答は確認できませんでした。');
      };
      channel.onerror = () => {
        if (current()) this.fail('音声接続で通信エラーが発生しました。');
      };
      await peer.setLocalDescription(await peer.createOffer());
      if (!current()) return;
      if (peer.iceGatheringState !== 'complete')
        await new Promise<void>((resolve, reject) => {
          const clean = () => {
            peer.removeEventListener('icegatheringstatechange', changed);
            abort.signal.removeEventListener('abort', cancelled);
            this.clearTimer(timer);
          };
          const changed = () => {
            if (peer.iceGatheringState === 'complete') {
              clean();
              resolve();
            }
          };
          const cancelled = () => {
            clean();
            reject(new DOMException('Cancelled', 'AbortError'));
          };
          const timer = this.later(() => {
            clean();
            reject(
              new Error('音声の通信経路を準備できませんでした。ネットワークを確認してください。'),
            );
          }, 10_000);
          peer.addEventListener('icegatheringstatechange', changed);
          abort.signal.addEventListener('abort', cancelled, { once: true });
          changed();
        });
      if (!current()) return;
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error('音声接続情報を作成できませんでした。');
      const response = await this.deps.fetch('/api/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp }),
        signal: abort.signal,
      });
      const result = record(await response.json());
      if (!current()) return;
      if (!response.ok)
        throw new Error(
          typeof result.error === 'string' ? result.error : '音声サービスに接続できませんでした。',
        );
      const session = record(result.session),
        transport = record(result.transport);
      if (
        typeof session.id !== 'string' ||
        transport.type !== 'webrtc' ||
        typeof transport.sdp !== 'string'
      )
        throw new Error('音声の接続情報が正しくありません。');
      this.sessionId = session.id;
      await peer.setRemoteDescription({ type: 'answer', sdp: transport.sdp });
      // session.started (not the data-channel open event) establishes readiness.
    } catch (error) {
      if (!current()) return;
      const name = error instanceof Error ? error.name : '';
      this.fail(
        name === 'NotAllowedError'
          ? 'マイクが許可されていません。ブラウザの設定で許可してから、もう一度お試しください。'
          : name === 'NotFoundError'
            ? 'マイクが見つかりません。マイクを接続してください。'
            : name === 'NotReadableError'
              ? 'マイクを使用できません。ほかのアプリの使用状況を確認してください。'
              : error instanceof Error
                ? error.message
                : '音声を開始できませんでした。',
      );
    }
  };
  private receive(raw: unknown) {
    const event = record(raw);
    if (typeof event.event_id === 'string') {
      if (this.seenEvents.has(event.event_id)) return;
      this.seenEvents.add(event.event_id);
      if (this.seenEvents.size > 10000) {
        this.stop('会話が長くなったので終了しました。もう一度接続できます。');
        return;
      }
    }
    if (event.type === 'session.closed') {
      const seconds = record(event.usage).seconds;
      const notice = this.snapshot.stopping ? this.snapshot.notice : '音声アシストを終了しました。';
      this.release();
      this.update({
        state: 'idle',
        finalized: true,
        notice,
        ...(typeof seconds === 'number' ? { seconds } : {}),
      });
      return;
    }
    // Closing can cancel an in-flight commentary and emit a command error.
    // Keep the transport alive so the final session.closed can still arrive.
    if (this.snapshot.stopping) return;
    if (event.type === 'error') {
      this.fail('音声サービスが処理を受け付けませんでした。API権限や利用状況を確認してください。');
      return;
    }
    if (event.type === 'session.started') {
      if (this.ready) return;
      if (record(event.session).id !== this.sessionId) {
        this.fail('音声セッションが一致しません。もう一度接続してください。');
        return;
      }
      this.ready = true;
      this.clearTimer(this.connectTimer);
      this.connectTimer = null;
      this.update({ state: 'listening', notice: '' });
      this.later(
        () =>
          this.stop(
            '費用を抑えるため、1分間で音声アシストを終了しました。手動の練習は続けられます。',
          ),
        MAX_SESSION_SECONDS * 1000,
      );
      return;
    }
    if (!this.ready) return;
    if (event.type === 'session.usage.updated' && typeof record(event.usage).seconds === 'number') {
      this.update({ seconds: record(event.usage).seconds as number });
      return;
    }
    if (
      event.type === 'session.input_transcript.delta' ||
      event.type === 'session.output_transcript.delta'
    ) {
      if (
        typeof event.delta !== 'string' ||
        typeof event.start_ms !== 'number' ||
        typeof event.end_ms !== 'number'
      )
        return;
      const speaker = event.type === 'session.input_transcript.delta' ? 'user' : 'coach';
      const fragments = [
        ...this.snapshot.fragments,
        {
          id: typeof event.event_id === 'string' ? event.event_id : crypto.randomUUID(),
          speaker,
          delta: event.delta.slice(0, 8000),
          startMs: event.start_ms,
          endMs: event.end_ms,
          order: this.snapshot.fragments.length,
        } as TranscriptFragment,
      ].slice(-300);
      const text = (role: string) =>
        fragments
          .filter((f) => f.speaker === role)
          .sort((a, b) => a.startMs - b.startMs || a.order - b.order)
          .map((f) => f.delta)
          .join('')
          .slice(-16000);
      this.update({ fragments, inputTranscript: text('user'), outputTranscript: text('coach') });
      return;
    }
    if (event.type === 'session.delegation.created') {
      const id = record(event.delegation).id;
      if (typeof id !== 'string' || !id || this.seenDelegations.has(id)) return;
      this.seenDelegations.add(id);
      this.latestDelegation = id;
      this.pending = null;
      this.update({
        recommendedLessonId: null,
        awaitingDisplay: null,
        notice: '練習できることばを確認しています…',
      });
      return;
    }
    if (
      event.type !== 'decision.event' ||
      typeof event.delegation_id !== 'string' ||
      event.delegation_id !== this.latestDelegation ||
      this.completedDecisions.has(event.delegation_id)
    )
      return;
    const nested = record(event.event);
    if (nested.type === 'decision.failed') {
      this.completedDecisions.add(event.delegation_id);
      this.pending = null;
      this.update({
        recommendedLessonId: null,
        notice: '教材を選べませんでした。もう一度話すか、選択モードから選んでください。',
      });
      this.commentary(
        event.delegation_id,
        '教材選択の処理に失敗したため、教材は変更していません。選択モードから手動で選べます。',
      );
      return;
    }
    if (nested.type !== 'decision.completed') return;
    this.completedDecisions.add(event.delegation_id);
    const answers = record(nested.decision).answers;
    const answer = Array.isArray(answers)
      ? record(answers.find((item) => record(item).name === 'lesson_id'))
      : {};
    if (answer.type !== 'choice' || !isChoice(answer.choice)) {
      this.update({
        notice: '教材を選べませんでした。選択モードから選んでください。',
        recommendedLessonId: null,
      });
      this.commentary(
        event.delegation_id,
        '有効な教材選択結果がなかったため、教材は変更していません。選択モードから手動で選べます。',
      );
      return;
    }
    this.update({ recommendedLessonId: answer.choice, notice: '' });
    if (answer.choice === 'unclear') {
      this.commentary(
        event.delegation_id,
        '練習したいことばを1つに特定できませんでした。教材は変更していません。教材がないとは言わず、「練習したいことばを、もう一度1つだけ話してね。『こんにちは』だけでも選べるよ」と案内してください。',
      );
    } else if (answer.choice === 'none') {
      this.commentary(
        event.delegation_id,
        `対応する教材がありません。教材は変更していません。「この文章の手話はまだ教材化していません」と伝え、${lessonNames}から選べると案内してください。`,
      );
    } else {
      this.pending = { id: answer.choice, delegation: event.delegation_id };
      this.commentary(
        event.delegation_id,
        `「${labels[answer.choice]}」の提案を画面に表示しました。まだ教材は変更していません。画面の「このことばを練習する」で確認するよう案内してください。`,
      );
    }
  }
  confirmLesson = (id: LessonId) => {
    if (
      !this.ready ||
      this.snapshot.stopping ||
      this.pending?.id !== id ||
      this.pending.delegation !== this.latestDelegation ||
      this.snapshot.awaitingDisplay
    )
      return;
    this.update({ awaitingDisplay: id });
    try {
      this.applyLesson(id);
    } catch {
      this.fail('教材を切り替えられませんでした。手動で選んでください。');
    }
  };
  reportDisplayedLesson = (id: LessonId) => {
    if (this.snapshot.awaitingDisplay === id && this.pending?.id === id) {
      const delegation = this.pending.delegation;
      this.pending = null;
      this.displayed = id;
      this.update({
        awaitingDisplay: null,
        recommendedLessonId: null,
        notice: `「${labels[id]}」のお手本を開きました。`,
      });
      this.commentary(
        delegation,
        `利用者が画面で確認し、「${labels[id]}」のお手本が実際に表示されました。カメラは自動開始していません。お手本を見て「カメラで練習する」を押すよう案内してください。${lessons.find((lesson) => lesson.id === id)?.practiceNote ?? ''}`,
      );
    } else if (id !== this.displayed) {
      this.displayed = id;
      this.pending = null;
      this.latestDelegation = '';
      this.update({ recommendedLessonId: null, awaitingDisplay: null, notice: '' });
    }
  };
  dismissRecommendation = () => {
    const pending = this.pending;
    this.pending = null;
    this.latestDelegation = '';
    this.update({
      recommendedLessonId: null,
      awaitingDisplay: null,
      notice: '教材は変えずに続けられます。',
    });
    if (pending && !this.snapshot.stopping)
      this.commentary(
        pending.delegation,
        '利用者が教材の提案を取り消しました。教材を変更していません。',
      );
  };
  selectLessonManually = (id: LessonId) => {
    this.dismissRecommendation();
    this.update({ notice: '' });
    this.applyLesson(id);
  };
  resumeAudio = async () => {
    if (!this.ready || this.snapshot.stopping) return;
    try {
      await this.audio?.play();
      this.update({ playbackBlocked: false });
    } catch {
      this.update({ playbackBlocked: true });
    }
  };
  stop = (notice = '音声アシストを終了しました。') => {
    if (this.snapshot.stopping) return;
    this.pending = null;
    this.latestDelegation = '';
    this.audio?.pause();
    if (this.ready && this.channel?.readyState === 'open') {
      this.update({ stopping: true, recommendedLessonId: null, awaitingDisplay: null, notice });
      this.microphone?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      if (!this.send({ type: 'session.close' })) {
        this.fail('終了の通知を送れませんでした。音声接続を切断しました。');
        return;
      }
      this.later(() => {
        this.release();
        this.update({
          state: 'idle',
          finalized: false,
          notice: '音声接続を切断しました。サービス側の終了応答は確認できませんでした。',
        });
      }, 3000);
    } else {
      this.release();
      this.update({ state: 'idle', error: '', notice });
    }
  };
  dispose = () => {
    this.send({ type: 'session.close' });
    this.release();
    this.update({ state: 'idle' });
  };
}
