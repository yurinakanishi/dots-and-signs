import { bodyAnchor, inspectHand } from './geometry';
import type { Feedback, Frame, SignId } from './types';

export { fingerExtensions, inspectHand } from './geometry';
// Geometry thresholds are NOT accuracy percentages. See docs/RECOGNITION.md.
export const RECOGNITION = {
  maxFrameGapMs: 400,
  settleMs: 260,
  minFrames: 3,
  deadlineMs: 8000,
} as const;
type XY = { x: number; y: number };
type LocatedHand = NonNullable<ReturnType<typeof inspectHand>> & {
  id: 'Left' | 'Right';
  at: XY;
  wrist: XY;
  tip: XY;
  edge: XY;
};
type Phase = 'intro' | 'cross' | 'greet' | 'bow' | 'lift';
const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const open = (h: LocatedHand) =>
  (['index', 'middle', 'ring', 'pinky'] as const).every((f) => h.extensions[f] >= 0.68);
const otherFolded = (h: LocatedHand) =>
  h.extensions.middle < 0.5 &&
  h.extensions.ring < 0.5 &&
  h.extensions.pinky < 0.5 &&
  h.extensions.thumb < 0.72;
const indexUp = (h: LocatedHand) =>
  otherFolded(h) && h.extensions.index >= 0.72 && h.indexLift > 0.65 && h.up > 0.55;
const indexBowed = (h: LocatedHand) =>
  otherFolded(h) && (h.extensions.index < 0.55 || h.indexLift < 0.45);
const nearChest = (h: LocatedHand) => Math.abs(h.at.x) < 0.75 && h.at.y > -0.28 && h.at.y < 0.8;

export function waitingFeedback(): Feedback {
  return { status: 'waiting', message: '顔と両手が映るように、少し離れてね。', step: 0 };
}

/** One uninterrupted attempt; each lesson requires its ordered motion sequence. */
export class SignRecognizer {
  private sign: SignId;
  private phase: Phase = 'intro';
  private phaseSince = 0;
  private holdSince: number | null = null;
  private holdFrames = 0;
  private lastTimestamp: number | null = null;
  private lastBody: { cx: number; cy: number; scale: number } | null = null;
  private previous = new Map<string, XY>();
  private origin = new Map<string, LocatedHand>();
  private activeId: string | null = null;
  private complete = false;

  constructor(sign: SignId) {
    this.sign = sign;
  }
  reset(sign: SignId = this.sign) {
    this.sign = sign;
    this.phase = 'intro';
    this.phaseSince = 0;
    this.holdSince = null;
    this.holdFrames = 0;
    this.lastTimestamp = null;
    this.lastBody = null;
    this.previous.clear();
    this.origin.clear();
    this.activeId = null;
    this.complete = false;
  }
  private clearHold() {
    this.holdSince = null;
    this.holdFrames = 0;
  }
  private settle(ok: boolean, time: number, duration: number = RECOGNITION.settleMs) {
    if (!ok) {
      this.clearHold();
      return false;
    }
    this.holdSince ??= time;
    this.holdFrames++;
    return time - this.holdSince >= duration && this.holdFrames >= RECOGNITION.minFrames;
  }
  private next(phase: Phase, time: number, hands: LocatedHand[]) {
    this.phase = phase;
    this.phaseSince = time;
    this.clearHold();
    this.origin = new Map(hands.map((h) => [h.id, h]));
  }
  private reply(message: string, step = 0, status: Feedback['status'] = 'move'): Feedback {
    return { message, step, status };
  }
  private restart(message: string): Feedback {
    this.reset();
    return this.reply(message, 0, 'adjust');
  }
  private success(): Feedback {
    this.complete = true;
    return this.reply('いいね！ 手の動きを確認できたよ。', 2, 'success');
  }

  update(frame: Frame): Feedback {
    if (
      ![frame.timestamp, frame.width, frame.height].every(Number.isFinite) ||
      frame.width <= 0 ||
      frame.height <= 0
    )
      return this.restart('カメラを確認して、もう一度。');
    if (this.complete) return this.success();
    if (
      this.lastTimestamp !== null &&
      (frame.timestamp <= this.lastTimestamp ||
        frame.timestamp - this.lastTimestamp > RECOGNITION.maxFrameGapMs)
    ) {
      return this.restart('動きが途切れたので、最初の形からもう一度。');
    }
    this.lastTimestamp = frame.timestamp;
    const body = bodyAnchor(frame);
    if (!body)
      return this.restart(
        frame.poses.length > 1 ? 'ひとりずつ、練習してみよう。' : '顔と肩も、カメラに映してね。',
      );
    if (
      this.lastBody &&
      (Math.hypot(body.cx - this.lastBody.cx, body.cy - this.lastBody.cy) / body.scale > 0.3 ||
        Math.abs(Math.log(body.scale / this.lastBody.scale)) > 0.25)
    )
      return this.restart('体の位置を落ち着かせて、最初から。');
    this.lastBody = body;
    // Hello begins with one hand. Allow time to bring the second hand into view,
    // while requiring the original hand to remain tracked throughout the transition.
    const minimum =
      this.sign === 'hello' && (this.phase === 'intro' || this.phase === 'greet') ? 1 : 2;
    if (frame.hands.length < minimum || frame.hands.length > 2)
      return this.restart(
        minimum === 1
          ? 'まずは、額に2本の指をあてよう。'
          : '両手が見える位置で、最初からやってみよう。',
      );
    if (new Set(frame.hands.map((h) => h.handedness)).size !== frame.hands.length)
      return this.restart('両手を少し離して、見えやすくしてね。');
    const hands: LocatedHand[] = [];
    for (const hand of frame.hands) {
      const m = inspectHand(hand, frame);
      if (!m || !m.inFrame || m.palm < frame.height * 0.035 || m.palm > frame.height * 0.4)
        return this.restart('指先から手首まで、はっきり映してね。');
      const h: LocatedHand = {
        ...m,
        id: hand.handedness,
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
      if (previous && distance(previous, h.at) > 0.65)
        return this.restart('ゆっくり動かして、最初からもう一度。');
      hands.push(h);
    }
    this.previous = new Map(hands.map((h) => [h.id, h.at]));
    const time = frame.timestamp;
    if (this.phase !== 'intro' && time - this.phaseSince > RECOGNITION.deadlineMs)
      return this.restart('ひと息ついて、最初の形からやってみよう。');

    if (this.sign === 'hello' && this.phase === 'intro') {
      const h = hands.find(
        (h) =>
          h.extensions.index > 0.72 &&
          h.extensions.middle > 0.72 &&
          h.extensions.ring < 0.5 &&
          h.extensions.pinky < 0.5 &&
          h.extensions.thumb < 0.72 &&
          distance(h.tip, body.forehead) < 0.23 &&
          h.up > 0.35,
      );
      if (this.settle(!!h, time)) {
        this.activeId = h!.id;
        this.next('greet', time, hands);
        return this.reply('いいね。次は、両手の人差し指を立てよう。', 1);
      }
      return this.reply('2本の指を額の真ん中へ。少し止めてね。', 0);
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
        const ready = this.settle(separated, time);
        if (ready) this.next('cross', time, hands);
        return this.reply(
          separated
            ? 'そのまま、目の前で両手を交差させよう。'
            : '手のひらを前に向け、顔の左右にひらこう。',
          ready ? 1 : 0,
        );
      }
      const oa = this.origin.get(a.id)!,
        ob = this.origin.get(b.id)!;
      const crossed =
        faceLevel &&
        (oa.at.x - ob.at.x) * (a.at.x - b.at.x) < -0.02 &&
        Math.abs(a.at.x - oa.at.x) > 0.25 &&
        Math.abs(b.at.x - ob.at.x) > 0.25 &&
        Math.abs(a.at.x - b.at.x) < 0.65;
      if (this.settle(crossed, time, 140)) {
        this.next('greet', time, hands);
        return this.reply('次は、両手の人差し指であいさつしよう。', 2);
      }
      return this.reply('目の前で、左右の手が交差するまで動かしてね。', 1);
    }

    if (this.phase === 'greet' || this.phase === 'bow') {
      const step = this.sign === 'hello' && this.phase === 'greet' ? 1 : 2;
      if (this.sign === 'hello' && !hands.some((h) => h.id === this.activeId))
        return this.restart('手が見えなくなったので、額の形からもう一度。');
      if (hands.length < 2) {
        this.clearHold();
        return this.reply('もう片方の手も映して、人差し指を立てよう。', step);
      }
      if (this.phase === 'greet') {
        const spread = Math.abs(hands[0].at.x - hands[1].at.x);
        const upright =
          hands.every((h) => nearChest(h) && indexUp(h)) &&
          spread > 0.18 &&
          spread < 0.95 &&
          Math.abs(hands[0].at.y - hands[1].at.y) < 0.28;
        const ready = this.settle(upright, time);
        if (ready) this.next('bow', time, hands);
        return this.reply(
          ready
            ? '指どうしがおじぎするように、両方を曲げよう。'
            : '胸の前で、人差し指だけを立てて近づけよう。',
          step,
        );
      }
      const bowed = hands.every((h) => {
        const origin = this.origin.get(h.id);
        return origin && nearChest(h) && indexBowed(h) && distance(h.wrist, origin.wrist) < 0.3;
      });
      if (this.settle(bowed, time, 180)) return this.success();
      return this.reply('手首はそのまま。両方の人差し指を曲げて、軽く会釈。', 2);
    }

    if (this.sign === 'thanks') {
      const support = hands.find(
        (h) => open(h) && h.horizontal > 0.65 && h.normal.y > 0.45 && nearChest(h),
      );
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
      if (this.phase === 'intro') {
        const touching =
          !!support &&
          !!active &&
          distance(active.edge, support.at) < 0.3 &&
          active.at.y < support.at.y + 0.08;
        const ready = this.settle(touching, time);
        if (ready) {
          this.activeId = active!.id;
          this.next('lift', time, hands);
        }
        return this.reply(
          ready
            ? 'そのまま、上の手をすっと上げよう。'
            : support
              ? 'もう片方の手を、小指側から手の甲にのせよう。'
              : '片手を胸の前に。手の甲を上へ向けてね。',
          ready ? 2 : support ? 1 : 0,
        );
      }
      const moving = hands.find((h) => h.id === this.activeId)!;
      const base = hands.find((h) => h.id !== this.activeId)!;
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
      if (this.settle(lifted, time, 180)) return this.success();
      return this.reply('下の手はそのまま。上の手だけをすっと上げよう。', 2);
    }
    return waitingFeedback();
  }
}
