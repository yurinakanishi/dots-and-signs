import type { Frame, Hand, Point, PosePoint, SignId } from '../src/lib/types';

// Synthetic anatomy: useful for invariants, never real-world accuracy evidence.
export type Shape = 'index' | 'two' | 'open' | 'bow' | 'fist';
type Orientation = 'front' | 'edge' | 'down';
const p = (x: number, y: number, z = 0): Point => ({ x, y, z });
export function makeHand(
  shape: Shape,
  x: number,
  y: number,
  left = false,
  orientation: Orientation = 'front',
): Hand {
  let w = Array.from({ length: 21 }, () => p(0, 0));
  w[0] = p(0, 0.075);
  w[1] = p(0.035, 0.05);
  w[2] = p(0.04, 0.027);
  w[3] = p(0.022, 0.02);
  w[4] = p(0.006, 0.016);
  const count = shape === 'fist' ? 0 : shape === 'open' ? 4 : shape === 'two' ? 2 : 1;
  [p(0.03, 0), p(0, -0.005), p(-0.027, 0), p(-0.048, 0.016)].forEach((base, i) => {
    const start = 5 + i * 4,
      length = i === 3 ? 0.024 : 0.035;
    w[start] = base;
    w[start + 1] = p(base.x, base.y - length);
    w[start + 2] =
      i < count ? p(base.x, base.y - length * 1.75) : p(base.x, base.y - length, -0.025);
    w[start + 3] = i < count ? p(base.x, base.y - length * 2.3) : p(base.x, base.y + 0.005, -0.035);
    if (shape === 'bow' && i === 0)
      for (let j = start + 1; j <= start + 3; j++) {
        const dy = w[j].y - base.y;
        w[j] = p(w[j].x, base.y + dy * 0.17, dy * 0.985);
      }
  });
  if (left) w.forEach((v) => (v.x = -v.x));
  if (orientation === 'edge') w = w.map((v) => p(v.z, v.y, -v.x));
  if (orientation === 'down') w = w.map((v) => p(v.y, -v.z, -v.x));
  const center = [0, 5, 9, 13, 17].reduce(
    (acc, i) => p(acc.x + w[i].x / 5, acc.y + w[i].y / 5),
    p(0, 0),
  );
  return {
    handedness: left ? 'Left' : 'Right',
    worldLandmarks: w,
    landmarks: w.map((v) =>
      p(
        (640 + x * 320 + (v.x - center.x) * 900) / 1280,
        (400 + y * 320 + (v.y - center.y) * 900) / 720,
        v.z,
      ),
    ),
  };
}
export function makePose(): PosePoint[] {
  const poses = Array.from({ length: 33 }, () => ({ ...p(0.5, 0.6), visibility: 0 }));
  for (const [i, x, y] of [
    [0, 640, 260],
    [2, 610, 235],
    [5, 670, 235],
    [11, 480, 400],
    [12, 800, 400],
  ]) {
    poses[i] = { ...p(x / 1280, y / 720), visibility: 1 };
  }
  return poses;
}
export function frame(hands: Hand[], timestamp = 0): Frame {
  return {
    hands: structuredClone(hands),
    poses: [makePose()],
    timestamp,
    width: 1280,
    height: 720,
  };
}
export function mirror(f: Frame): Frame {
  const result = structuredClone(f);
  result.poses.forEach((pose) => pose.forEach((v) => (v.x = 1 - v.x)));
  result.hands.forEach((h) => {
    h.handedness = h.handedness === 'Right' ? 'Left' : 'Right';
    h.landmarks.forEach((v) => (v.x = 1 - v.x));
    h.worldLandmarks.forEach((v) => (v.x = -v.x));
  });
  return result;
}
export const greeting = (bow = false) => [
  makeHand(bow ? 'bow' : 'index', -0.25, 0.25),
  makeHand(bow ? 'bow' : 'index', 0.25, 0.25, true),
];
export const thanks = (lift = false) => [
  makeHand('open', 0.08, lift ? -0.25 : 0.18, false, 'edge'),
  makeHand('open', 0, 0.35, true, 'down'),
];
export function motionFrames(sign: SignId, mirrored = false): Frame[] {
  const result: Frame[] = [];
  const hold = (hands: Hand[], count = 6) => {
    for (let i = 0; i < count; i++) result.push(frame(hands, result.length * 80));
  };
  if (sign === 'hello') {
    hold([makeHand('two', 0, -0.4)]);
    hold([makeHand('two', -0.12, -0.08), makeHand('index', 0.25, 0.25, true)], 1);
  } else if (sign === 'evening') {
    hold([makeHand('open', -0.55, -0.52), makeHand('open', 0.55, -0.52, true)]);
    hold([makeHand('open', -0.2, -0.52), makeHand('open', 0.2, -0.52, true)], 1);
    hold([makeHand('open', 0.12, -0.52), makeHand('open', -0.12, -0.52, true)]);
    hold([makeHand('index', -0.12, -0.08), makeHand('index', 0.12, -0.08, true)], 1);
  } else {
    hold(thanks());
    hold(thanks(true));
    return mirrored ? result.map(mirror) : result;
  }
  hold(greeting());
  hold(greeting(true));
  return mirrored ? result.map(mirror) : result;
}
