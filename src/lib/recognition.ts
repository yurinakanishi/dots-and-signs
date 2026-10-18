import { bodyAnchor, inspectHand } from './geometry';
import { HandTracker } from './handTracking';
import { isFreshFrame } from './frameTiming';
import type { Feedback, Finger, Frame, Hand, SignId } from './types';

export { fingerExtensions, inspectHand } from './geometry';
// Detection confidence and hold time are not measured recognition accuracy.
export const RECOGNITION = {
  maxFrameGapMs: 1000,
  trackingGraceMs: 1000,
  settleMs: 320,
  minFrames: 3,
  deadlineMs: 30_000,
} as const;

type XY = { x: number; y: number };
type LocatedHand = NonNullable<ReturnType<typeof inspectHand>> & {
  id: number;
  at: XY;
  wrist: XY;
  tip: XY;
  edge: XY;
};
type Phase = 'intro' | 'cross' | 'greet' | 'bow' | 'place' | 'lift';
const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const extended = (h: LocatedHand, finger: Finger, minimum = 0.68) => {
  const value = h.extensions[finger];
  return value !== null && value >= minimum;
};
const folded = (h: LocatedHand, finger: Finger, maximum = 0.5) => {
  const value = h.extensions[finger];
  return value !== null && value < maximum;
};
const open = (h: LocatedHand) =>
  (['index', 'middle', 'ring', 'pinky'] as const).every((f) => extended(h, f));
const otherFolded = (h: LocatedHand) =>
  folded(h, 'middle') && folded(h, 'ring') && folded(h, 'pinky') && folded(h, 'thumb', 0.72);
const indexUp = (h: LocatedHand) =>
  otherFolded(h) && extended(h, 'index', 0.72) && h.indexLift > 0.65 && h.up > 0.55;
const indexBowed = (h: LocatedHand) =>
  otherFolded(h) && h.extensions.index !== null && (folded(h, 'index', 0.55) || h.indexLift < 0.45);
const nearChest = (h: LocatedHand) => Math.abs(h.at.x) < 0.75 && h.at.y > -0.28 && h.at.y < 0.8;

export function waitingFeedback(sign: SignId = 'hello'): Feedback {
  return {
    status: 'waiting',
    message: '顔と手が映るように、少し離れてね。',
    step: 0,
    completedSteps: 0,
    holdProgress: 0,
    handCount: 0,
    requiredHands: sign === 'evening' ? 2 : 1,
    bodyVisible: false,
    trackingPaused: false,
    demoFrame: 0,
  };
}

/** Each confirmed phase advances the visible guide; missing frames never earn progress. */
export class SignRecognizer {
  private sign: SignId;
  private phase: Phase = 'intro';
  private phaseSince = 0;
  private holdSince: number | null = null;
  private holdFrames = 0;
  private holdProgress = 0;
  private missingSince: number | null = null;
  private lastTimestamp: number | null = null;
  private lastBody: { cx: number; cy: number; scale: number } | null = null;
  private previous = new Map<number, XY>();
  private origin = new Map<number, LocatedHand>();
  private activeId: number | null = null;
  private supportId: number | null = null;
  private complete = false;
  private tracker = new HandTracker();
  private bodyVisible = false;
  visibleHands: Hand[] = [];

  constructor(sign: SignId) {
    this.sign = sign;
  }
  reset(sign: SignId = this.sign) {
    this.sign = sign;
    this.phase = 'intro';
    this.phaseSince = 0;
    this.clearHold();
    this.missingSince = null;
    this.lastTimestamp = null;
    this.lastBody = null;
    this.previous.clear();
    this.origin.clear();
    this.activeId = null;
    this.supportId = null;
    this.complete = false;
    this.bodyVisible = false;
    this.visibleHands = [];
    this.tracker.reset();
  }
  private step() {
    if (this.complete) return 2;
    if (this.phase === 'intro') return 0;
    if (this.phase === 'cross' || this.phase === 'place') return 1;
    if (this.phase === 'greet' && this.sign === 'hello') return 1;
    return 2;
  }
  private clearHold() {
    this.holdSince = null;
    this.holdFrames = 0;
    this.holdProgress = 0;
  }
  private settle(ok: boolean, time: number, duration: number = RECOGNITION.settleMs) {
    if (!ok) {
      this.clearHold();
      return false;
    }
    this.holdSince ??= time;
    this.holdFrames++;
    this.holdProgress = Math.min(0.75, Math.floor(((time - this.holdSince) / duration) * 4) / 4);
    return time - this.holdSince >= duration && this.holdFrames >= RECOGNITION.minFrames;
  }
  private next(phase: Phase, time: number, hands: LocatedHand[]) {
    this.phase = phase;
    this.phaseSince = time;
    this.clearHold();
    this.origin = new Map(hands.map((h) => [h.id, h]));
  }
  private reply(message: string, status: Feedback['status'] = 'move'): Feedback {
    const step = this.step();
    return {
      message,
      step,
      status,
      completedSteps: this.complete ? 3 : step,
      holdProgress: this.complete ? 1 : this.holdProgress,
      handCount: this.visibleHands.length,
      requiredHands: step === 0 && this.sign !== 'evening' ? 1 : 2,
      bodyVisible: this.bodyVisible,
      trackingPaused: false,
      demoFrame:
        this.sign === 'evening' && this.phase === 'bow'
          ? 3
          : this.complete && this.sign === 'evening'
            ? 3
            : step,
    };
  }
  private restart(message: string): Feedback {
    const hands = this.visibleHands,
      bodyVisible = this.bodyVisible;
    this.reset();
    this.visibleHands = hands;
    this.bodyVisible = bodyVisible;
    return this.reply(message, 'adjust');
  }
  private pause(message: string, time: number): Feedback {
    this.clearHold();
    this.missingSince ??= time;
    if (time - this.missingSince >= RECOGNITION.trackingGraceMs)
      return this.restart('手や顔がしばらく見えなかったので、ステップ1からもう一度。');
    return this.reply(message, 'adjust');
  }
  private success(): Feedback {
    this.complete = true;
    return this.reply('3ステップできたね！ 手の動きを確認できたよ。', 'success');
  }

  pauseTracking(now: number): Feedback {
    this.visibleHands = [];
    this.bodyVisible = false;
    if (this.complete) return this.success();
    const feedback = this.pause('映像と認識の更新を待っているよ。少しだけ、そのままでね。', now);
    return { ...feedback, trackingPaused: true };
  }

  update(frame: Frame, receivedAt = frame.timestamp): Feedback {
    if (
      ![frame.timestamp, frame.width, frame.height, receivedAt].every(Number.isFinite) ||
      frame.width <= 0 ||
      frame.height <= 0
    )
      return this.restart('カメラを確認して、ステップ1からもう一度。');
    if (!isFreshFrame(frame.timestamp, receivedAt)) return this.pauseTracking(receivedAt);
    this.visibleHands = this.tracker.update(frame);
    const body = bodyAnchor(frame);
    this.bodyVisible = !!body;
    if (this.complete) return this.success();
    if (
      this.lastTimestamp !== null &&
      (frame.timestamp <= this.lastTimestamp ||
        frame.timestamp - this.lastTimestamp >= RECOGNITION.maxFrameGapMs)
    )
      return this.restart('映像が途切れたので、ステップ1からもう一度。');
    this.lastTimestamp = frame.timestamp;
    if (!body)
      return this.pause(
        frame.poses.length > 1
          ? 'ひとりずつ、練習してみよう。'
          : '顔と肩も映してね。いまの段階で待っているよ。',
        frame.timestamp,
      );
    if (
      this.lastBody &&
      (Math.hypot(body.cx - this.lastBody.cx, body.cy - this.lastBody.cy) / body.scale > 0.3 ||
        Math.abs(Math.log(body.scale / this.lastBody.scale)) > 0.25)
    )
      return this.restart('体の位置を落ち着かせて、ステップ1から。');
    this.lastBody = body;

    const canAddSecond =
      (this.sign === 'hello' && this.phase === 'greet') || this.phase === 'place';
    const minimum = (this.phase === 'intro' && this.sign !== 'evening') || canAddSecond ? 1 : 2;
    if (this.visibleHands.length < minimum || frame.hands.length > 2)
      return this.pause(
        minimum === 1
          ? '手をカメラに映してね。いまの段階で待っているよ。'
          : 'もう片方の手が見えないよ。少し離して、両手を映してね。',
        frame.timestamp,
      );

    const hands: LocatedHand[] = [];
    for (const hand of this.visibleHands) {
      const m = inspectHand(hand, frame);
      if (!m || !m.inFrame || m.palm < frame.height * 0.025 || m.palm > frame.height * 0.4)
        return this.pause(
          '指先から手首まで映してね。小さすぎるときは少し近づこう。',
          frame.timestamp,
        );
      const h: LocatedHand = {
        ...m,
        id: hand.trackId!,
        at: body.locate(m.center),
        wrist: body.locate(hand.landmarks[0]),
        tip: body.locate({
          x: (hand.landmarks[8].x + hand.landmarks[12].x) / 2,
          y: (hand.landmarks[8].y + hand.landmarks[12].y) / 2,
          z: 0,
        }),
        edge: body.locate(hand.landmarks[17]),
      };
      const previous = this.previous.get(h.id);
      if (previous && distance(previous, h.at) > 0.8)
        return this.restart('ゆっくり動かして、ステップ1からもう一度。');
      hands.push(h);
    }
    if (
      this.sign === 'hello' &&
      (this.phase === 'greet' || this.phase === 'bow') &&
      !hands.some((h) => h.id === this.activeId)
    )
      return this.pause('最初に額へあてた手も映してね。', frame.timestamp);
    this.missingSince = null;
    this.previous = new Map(hands.map((h) => [h.id, h.at]));
    const time = frame.timestamp;
    if (this.phase !== 'intro' && time - this.phaseSince > RECOGNITION.deadlineMs)
      return this.restart('ひと息ついて、ステップ1からやってみよう。');

    if (this.sign === 'hello' && this.phase === 'intro') {
      const h = hands.find(
        (h) =>
          extended(h, 'index', 0.72) &&
          extended(h, 'middle', 0.72) &&
          folded(h, 'ring') &&
          folded(h, 'pinky') &&
          folded(h, 'thumb', 0.72) &&
          distance(h.tip, body.forehead) < 0.23 &&
          h.up > 0.35,
      );
      if (this.settle(!!h, time)) {
        this.activeId = h!.id;
        this.next('greet', time, hands);
        return this.reply('ステップ1できた！ 次は、両手の人差し指を立てよう。');
      }
      return this.reply('2本の指を額の真ん中へ。その形で少し止めてね。');
    }

    if (this.sign === 'evening' && (this.phase === 'intro' || this.phase === 'cross')) {
      const [a, b] = hands;
      const faceLevel = hands.every(
        (h) =>
          open(h) &&
          h.normal.z < -0.35 &&
          Math.abs(h.at.y - body.eyes.y) < 0.38 &&
          Math.abs(h.at.x - body.eyes.x) < 1,
      );
      if (this.phase === 'intro') {
        const separated =
          faceLevel &&
          Math.abs(a.at.x - b.at.x) > 0.65 &&
          (a.at.x - body.eyes.x) * (b.at.x - body.eyes.x) < 0;
        if (this.settle(separated, time)) {
          this.next('cross', time, hands);
          return this.reply('ステップ1できた！ 目の前で両手を交差させよう。');
        }
        return this.reply('手のひらを前に向け、顔の左右にひらいて、少し止めてね。');
      }
      const oa = this.origin.get(a.id),
        ob = this.origin.get(b.id);
      if (!oa || !ob) return this.restart('手の追跡が変わったので、ステップ1からもう一度。');
      const crossed =
        faceLevel &&
        (oa.at.x - ob.at.x) * (a.at.x - b.at.x) < -0.02 &&
        Math.abs(a.at.x - oa.at.x) > 0.25 &&
        Math.abs(b.at.x - ob.at.x) > 0.25 &&
        Math.abs(a.at.x - b.at.x) < 0.65;
      if (this.settle(crossed, time, 180)) {
        this.next('greet', time, hands);
        return this.reply('ステップ2できた！ 両手の人差し指を立てて、おじぎさせよう。');
      }
      return this.reply('目の前で、左右の手が交差するまで動かしてね。');
    }

    if (this.phase === 'greet' || this.phase === 'bow') {
      if (hands.length < 2) {
        this.clearHold();
        return this.reply(
          'ステップ1はできたよ。もう片方の手も映して、人差し指を立てよう。',
          'adjust',
        );
      }
      if (this.phase === 'greet') {
        const spread = Math.abs(hands[0].at.x - hands[1].at.x);
        const upright =
          hands.every((h) => nearChest(h) && indexUp(h)) &&
          spread > 0.18 &&
          spread < 0.95 &&
          Math.abs(hands[0].at.y - hands[1].at.y) < 0.28;
        if (this.settle(upright, time)) {
          this.next('bow', time, hands);
          return this.reply(
            this.sign === 'hello'
              ? 'ステップ2できた！ 指どうしがおじぎするように、両方を曲げよう。'
              : 'その形から、両方の人差し指を曲げて、おじぎさせよう。',
          );
        }
        return this.reply('胸の前で、両手の人差し指だけを立てて近づけよう。');
      }
      const bowed = hands.every((h) => {
        const origin = this.origin.get(h.id);
        return origin && nearChest(h) && indexBowed(h) && distance(h.wrist, origin.wrist) < 0.3;
      });
      if (this.settle(bowed, time, 240)) return this.success();
      return this.reply('手首はそのまま。両方の人差し指を曲げて、軽く会釈。');
    }

    if (this.sign === 'thanks') {
      const support = hands.find(
        (h) =>
          open(h) &&
          h.horizontal > 0.65 &&
          h.normal.y > 0.45 &&
          nearChest(h) &&
          (this.supportId === null || h.id === this.supportId),
      );
      if (this.phase === 'intro') {
        if (this.settle(!!support, time)) {
          this.supportId = support!.id;
          this.next('place', time, hands);
          return this.reply('ステップ1できた！ もう片方の手を、小指側からのせよう。');
        }
        return this.reply('片手を胸の前に。手の甲を上にして、少し止めてね。');
      }
      if (this.phase === 'place') {
        const active =
          support &&
          hands.find(
            (h) =>
              h.id !== support.id &&
              open(h) &&
              h.up > 0.55 &&
              Math.abs(h.normal.x) > 0.4 &&
              nearChest(h),
          );
        const touching =
          !!support &&
          !!active &&
          distance(active.edge, support.at) < 0.3 &&
          active.at.y < support.at.y + 0.08;
        if (this.settle(touching, time)) {
          this.activeId = active!.id;
          this.next('lift', time, hands);
          return this.reply('ステップ2できた！ 下の手を保って、上の手をすっと上げよう。');
        }
        return this.reply(
          hands.length < 2
            ? 'もう片方の手も映して、小指側から手の甲にのせよう。'
            : '下の手の甲に、もう片方の小指側を直角にのせて、少し止めよう。',
        );
      }
      const moving = hands.find((h) => h.id === this.activeId);
      const base = hands.find((h) => h.id === this.supportId);
      if (!moving || !base) return this.restart('手の追跡が変わったので、ステップ1からもう一度。');
      const initial = this.origin.get(moving.id)!,
        baseInitial = this.origin.get(base.id)!;
      const rise = initial.at.y - moving.at.y;
      const lifted =
        open(moving) &&
        moving.up > 0.4 &&
        Math.abs(moving.normal.x) > 0.4 &&
        open(base) &&
        base.horizontal > 0.65 &&
        base.normal.y > 0.45 &&
        distance(base.at, baseInitial.at) < 0.2 &&
        Math.abs(moving.at.x - initial.at.x) < 0.22 &&
        rise > 0.28 &&
        rise < 0.95;
      if (this.settle(lifted, time, 240)) return this.success();
      return this.reply('下の手はそのまま。上の手だけをすっと上げよう。');
    }
    return this.reply('お手本の形を、ゆっくりまねしてみよう。');
  }
}
