import type { Frame, Hand, Point, SignId } from '../src/lib/types';

// Synthetic anatomy fixtures validate invariants only. They are NOT accuracy evidence.
export function makeHand(sign: SignId | 'fist' | 'open', left = false): Hand {
  const p = (x: number, y: number, z = 0): Point => ({ x, y, z });
  const w: Point[] = Array.from({ length: 21 }, () => p(0, 0));
  w[0] = p(0, 0.075);
  w[1] = p(0.035, 0.05);
  w[2] = p(0.04, 0.027);
  w[3] = p(0.022, 0.02);
  w[4] = p(0.006, 0.016);
  if (sign === '5' || sign === 'open') {
    w[1] = p(0.035, 0.05);
    w[2] = p(0.06, 0.037);
    w[3] = p(0.085, 0.032);
    w[4] = p(0.11, 0.029);
  }
  const count =
    sign === 'fist' || sign === '5' ? 0 : sign === 'open' ? 4 : sign === '10' ? 1 : Number(sign);
  const bases = [p(0.03, 0), p(0, -0.005), p(-0.027, 0), p(-0.048, 0.016)];
  bases.forEach((base, index) => {
    const start = 5 + index * 4;
    const length = index === 3 ? 0.024 : 0.035;
    w[start] = base;
    w[start + 1] = p(base.x, base.y - length);
    if (index < count) {
      w[start + 2] = p(base.x, base.y - length * 1.75);
      w[start + 3] = p(base.x, base.y - length * 2.3);
    } else {
      w[start + 2] = p(base.x, base.y - length, -0.025);
      w[start + 3] = p(base.x, base.y + 0.005, -0.035);
    }
  });
  if (left)
    w.forEach((v) => {
      v.x = -v.x;
    });
  return {
    worldLandmarks: w,
    landmarks: w.map((v) => ({ x: 0.5 + v.x * 3, y: 0.46 + v.y * 3, z: v.z * 3 })),
    handedness: left ? 'Left' : 'Right',
  };
}
export function frame(hand: Hand | null, timestamp = 0): Frame {
  return { hands: hand ? [structuredClone(hand)] : [], timestamp, width: 1280, height: 720 };
}
