import { fingerNames, lessons } from './lessons';
import type { Feedback, Finger, FingerValues, Frame, Hand, Point, SignId } from './types';

// Scores below are geometry rules, NOT calibrated probabilities of correct signing.
export const RECOGNITION = {
  holdMs: 1050,
  minFrames: 9,
  maxFrameGapMs: 240,
  startHoldMs: 450,
  bendHoldMs: 300,
  motionDeadlineMs: 2800,
  minPalmPixels: 64,
  maxPalmFraction: 0.46,
  frontality: 0.62,
  straight: 0.76,
  folded: 0.47,
} as const;

const allFingers: Finger[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Point) => Math.sqrt(dot(a, a));
const distance = (a: Point, b: Point) => norm(sub(a, b));
const cross = (a: Point, b: Point): Point => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const angle = (a: Point, b: Point, c: Point) => {
  const u = sub(a, b),
    v = sub(c, b);
  return (Math.acos(clamp(dot(u, v) / Math.max(norm(u) * norm(v), 1e-9), -1, 1)) * 180) / Math.PI;
};

export function fingerExtensions(points: Point[]): FingerValues {
  const values = {} as FingerValues;
  // World-space angles are independent of screen rotation, translation, distance and mirror.
  const palm = Math.max(distance(points[0], points[9]), 1e-6);
  for (const [name, start] of [
    ['index', 5],
    ['middle', 9],
    ['ring', 13],
    ['pinky', 17],
  ] as const) {
    const pip = angle(points[start], points[start + 1], points[start + 2]);
    const dip = angle(points[start + 1], points[start + 2], points[start + 3]);
    const straightness = clamp((Math.min(pip, dip) - 65) / 100);
    const length = distance(points[start], points[start + 3]);
    const boneLength =
      distance(points[start], points[start + 1]) +
      distance(points[start + 1], points[start + 2]) +
      distance(points[start + 2], points[start + 3]);
    values[name] = Math.min(
      straightness,
      clamp((length / Math.max(boneLength, 1e-6) - 0.35) / 0.57),
    );
  }
  // A straight thumb laid across the palm is still folded: require lateral separation.
  const thumbAngle = Math.min(
    angle(points[1], points[2], points[3]),
    angle(points[2], points[3], points[4]),
  );
  const thumbSeparation = distance(points[4], points[5]) / palm;
  values.thumb = Math.min(clamp((thumbAngle - 110) / 55), clamp((thumbSeparation - 0.35) / 0.5));
  return values;
}

export function inspectHand(hand: Hand, frame: Frame) {
  const p = hand.landmarks,
    w = hand.worldLandmarks;
  if (
    p.length !== 21 ||
    w.length !== 21 ||
    ![...p, ...w].every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))
  )
    return null;
  const palm = Math.hypot((p[0].x - p[9].x) * frame.width, (p[0].y - p[9].y) * frame.height);
  const normal = cross(sub(w[5], w[0]), sub(w[17], w[0]));
  const frontality = Math.abs(normal.z) / Math.max(norm(normal), 1e-9);
  // Input is UNMIRRORED. A right palm facing the camera has a negative z cross-product.
  // Handedness confidence is not used as a detection/correctness score.
  const palmFacingCamera = hand.handedness === 'Right' ? normal.z < 0 : normal.z > 0;
  const up = ((p[0].y - p[9].y) * frame.height) / Math.max(palm, 1);
  const thumb = sub(p[4], p[2]);
  const thumbHorizontal = Math.abs(thumb.x * frame.width) > Math.abs(thumb.y * frame.height) * 1.4;
  const inFrame = p.every((v) => v.x > 0.035 && v.x < 0.965 && v.y > 0.035 && v.y < 0.965);
  return {
    extensions: fingerExtensions(w),
    palm,
    frontality,
    palmFacingCamera,
    up,
    thumbHorizontal,
    inFrame,
  };
}

export function waitingFeedback(): Feedback {
  return {
    status: 'waiting',
    message: '片手を、枠の中に入れてみよう。',
    detail: '指先から手首まで映してね。右手でも左手でも練習できます。',
    progress: 0,
    checks: { visible: false, shape: false, orientation: false, steady: false },
  };
}

/** Temporal state belongs to ONE lesson, ONE uninterrupted hand track and ONE session. */
export class SignRecognizer {
  private holdSince: number | null = null;
  private frames = 0;
  private lastTimestamp: number | null = null;
  private lastWrist: Point | null = null;
  private lastHandedness: string | null = null;
  private phase: 'start' | 'bend' = 'start';
  private phaseSince = 0;
  private motionWrist: Point | null = null;
  private motionPalm = 1;
  private complete = false;
  private sign: SignId;

  constructor(sign: SignId) {
    this.sign = sign;
  }

  reset(sign: SignId = this.sign) {
    this.sign = sign;
    this.holdSince = null;
    this.frames = 0;
    this.lastTimestamp = null;
    this.lastWrist = null;
    this.lastHandedness = null;
    this.phase = 'start';
    this.phaseSince = 0;
    this.motionWrist = null;
    this.complete = false;
  }

  private clearHold() {
    this.holdSince = null;
    this.frames = 0;
  }
  private breakSequence() {
    this.clearHold();
    this.phase = 'start';
    this.motionWrist = null;
  }

  update(frame: Frame): Feedback {
    const result = waitingFeedback();
    if (
      !Number.isFinite(frame.timestamp) ||
      !Number.isFinite(frame.width) ||
      !Number.isFinite(frame.height) ||
      frame.width <= 0 ||
      frame.height <= 0
    ) {
      this.reset();
      return result;
    }
    if (this.complete) return this.success();
    if (
      this.lastTimestamp !== null &&
      (frame.timestamp <= this.lastTimestamp ||
        frame.timestamp - this.lastTimestamp > RECOGNITION.maxFrameGapMs)
    ) {
      this.breakSequence();
      this.lastWrist = null;
    }
    this.lastTimestamp = frame.timestamp;
    if (frame.hands.length !== 1) {
      this.breakSequence();
      this.lastWrist = null;
      this.lastHandedness = null;
      if (frame.hands.length > 1) {
        result.message = '練習する片手だけを映してね。';
        result.detail = 'もう片方の手は、いったん画面の外へ。';
      }
      return result;
    }
    const hand = frame.hands[0];
    if (this.lastHandedness !== null && this.lastHandedness !== hand.handedness) {
      this.breakSequence();
      this.lastWrist = null;
    }
    this.lastHandedness = hand.handedness;
    const metrics = inspectHand(hand, frame);
    if (!metrics) {
      this.breakSequence();
      return result;
    }
    const adjust = (message: string, detail: string, resetSequence = true): Feedback => {
      if (resetSequence) this.breakSequence();
      else this.clearHold();
      return { ...result, status: 'adjust', message, detail };
    };
    if (!metrics.inFrame)
      return adjust('指先と手首を、画面の中に。', '手が切れない位置まで、少し下がってみよう。');
    if (metrics.palm < RECOGNITION.minPalmPixels)
      return adjust('もう少し、カメラに近づけてみて。', '手が小さいと、指の形が見えにくくなるよ。');
    if (metrics.palm > frame.height * RECOGNITION.maxPalmFraction)
      return adjust(
        '手を少し、カメラから離してね。',
        '指先から手首まで、余裕を持って映してみよう。',
      );
    result.checks.visible = true;
    if (metrics.frontality < RECOGNITION.frontality || !metrics.palmFacingCamera)
      return adjust('手のひらを、カメラに向けよう。', '手を横向きにせず、指が見える向きにしてね。');
    if (metrics.up < 0.72)
      return adjust('手首を下に、指の付け根を上に。', '手全体が横に倒れないようにしてみよう。');
    if (this.sign === '5' && !metrics.thumbHorizontal)
      return adjust('親指を、横に伸ばしてみよう。', '「5」の親指は、上ではなく横を向くよ。');
    result.checks.orientation = true;

    const wrist = hand.landmarks[0];
    const wristJump = this.lastWrist
      ? Math.hypot(
          (wrist.x - this.lastWrist.x) * frame.width,
          (wrist.y - this.lastWrist.y) * frame.height,
        ) / metrics.palm
      : 0;
    this.lastWrist = wrist;
    if (wristJump > 0.3)
      return adjust('手を落ち着かせて、もう一度。', 'カメラの前で、手首をゆっくり止めてね。');

    const target = lessons.find((lesson) => lesson.id === this.sign)!;
    if (this.sign === '10' && this.phase === 'bend') {
      if (frame.timestamp - this.phaseSince > RECOGNITION.motionDeadlineMs)
        return adjust(
          'もう一度、「1」の形から。',
          '伸ばしてから曲げる動きを、ゆっくり続けてみよう。',
        );
      if (
        this.motionWrist &&
        Math.hypot(
          (wrist.x - this.motionWrist.x) * frame.width,
          (wrist.y - this.motionWrist.y) * frame.height,
        ) /
          this.motionPalm >
          0.45
      )
        return adjust('手首はそのままで、指だけ曲げよう。', '「1」の形からやり直そう。');
      const otherFingersFolded = allFingers
        .filter((f) => f !== 'index')
        .every((f) => metrics.extensions[f] <= RECOGNITION.folded);
      if (!otherFingersFolded)
        return adjust('人差し指以外は、握ったままで。', '「1」の形からやり直してみよう。');
      result.checks.shape = true;
      if (metrics.extensions.index > 0.4) {
        this.clearHold();
        return {
          ...result,
          status: 'move',
          progress: 0.45,
          message: 'そのまま、人差し指を曲げよう。',
          detail: '手首を止めて、指だけをゆっくり。',
        };
      }
      return this.hold(frame.timestamp, RECOGNITION.bendHoldMs, 4, result, 0.55);
    }

    const wrongFinger = allFingers.find((f) =>
      target.fingers.includes(f)
        ? metrics.extensions[f] < RECOGNITION.straight
        : metrics.extensions[f] > RECOGNITION.folded,
    );
    if (wrongFinger) {
      const extend = target.fingers.includes(wrongFinger);
      return adjust(
        `${fingerNames[wrongFinger]}を、${extend ? 'もう少し伸ばして' : '軽くたたんで'}みよう。`,
        target.description,
      );
    }
    result.checks.shape = true;
    if (this.sign === '10') {
      this.holdSince ??= frame.timestamp;
      this.frames++;
      const elapsed = frame.timestamp - this.holdSince;
      if (elapsed >= RECOGNITION.startHoldMs && this.frames >= 5) {
        this.phase = 'bend';
        this.phaseSince = frame.timestamp;
        this.motionWrist = wrist;
        this.motionPalm = metrics.palm;
        this.clearHold();
        return {
          ...result,
          status: 'move',
          progress: 0.45,
          message: 'いいね！ 人差し指を曲げてみよう。',
          detail: 'ほかの指は握ったまま、手首を止めて。',
        };
      }
      return {
        ...result,
        status: 'holding',
        progress: Math.min(0.45, (elapsed / RECOGNITION.startHoldMs) * 0.45),
        message: 'まずは「1」の形で、少し止めよう。',
        detail: 'このあと、人差し指を曲げるよ。',
      };
    }
    return this.hold(frame.timestamp, RECOGNITION.holdMs, RECOGNITION.minFrames, result);
  }

  private hold(
    timestamp: number,
    duration: number,
    minFrames: number,
    result: Feedback,
    startProgress = 0,
  ): Feedback {
    this.holdSince ??= timestamp;
    this.frames++;
    const elapsed = timestamp - this.holdSince;
    const ratio = Math.min(elapsed / duration, this.frames / minFrames, 1);
    if (ratio >= 1) {
      this.complete = true;
      return this.success();
    }
    return {
      ...result,
      status: 'holding',
      progress: startProgress + ratio * (1 - startProgress),
      message: 'いい形！ そのままキープ。',
      detail: 'もう少しで、このレッスンの形を確認できるよ。',
    };
  }

  private success(): Feedback {
    return {
      status: 'success',
      message: 'できたね！ その一歩に、拍手。',
      detail: `数字「${this.sign}」の練習をクリアしました。`,
      progress: 1,
      checks: { visible: true, shape: true, orientation: true, steady: true },
    };
  }
}
