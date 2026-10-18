import type { FingerValues, Frame, Hand, Point } from './types';

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Point) => Math.sqrt(dot(a, a));
const distance = (a: Point, b: Point) => norm(sub(a, b));
const angle = (a: Point, b: Point, c: Point) => {
  const u = sub(a, b),
    v = sub(c, b);
  return (Math.acos(clamp(dot(u, v) / Math.max(norm(u) * norm(v), 1e-9), -1, 1)) * 180) / Math.PI;
};
export const finite = (p: Point) =>
  p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

export function fingerExtensions(points: Point[]): FingerValues {
  const values = {} as FingerValues;
  const palm = Math.max(distance(points[0], points[9]), 1e-6);
  for (const [name, start] of [
    ['index', 5],
    ['middle', 9],
    ['ring', 13],
    ['pinky', 17],
  ] as const) {
    const pip = angle(points[start], points[start + 1], points[start + 2]);
    const dip = angle(points[start + 1], points[start + 2], points[start + 3]);
    const length = distance(points[start], points[start + 3]);
    const bones =
      distance(points[start], points[start + 1]) +
      distance(points[start + 1], points[start + 2]) +
      distance(points[start + 2], points[start + 3]);
    values[name] = Math.min(
      clamp((Math.min(pip, dip) - 65) / 100),
      clamp((length / Math.max(bones, 1e-6) - 0.35) / 0.57),
    );
  }
  const thumbAngle = Math.min(
    angle(points[1], points[2], points[3]),
    angle(points[2], points[3], points[4]),
  );
  values.thumb = Math.min(
    clamp((thumbAngle - 110) / 55),
    clamp((distance(points[4], points[5]) / palm - 0.35) / 0.5),
  );
  return values;
}

export function inspectHand(hand: Hand, frame: Frame) {
  const p = hand.landmarks,
    w = hand.worldLandmarks;
  if (p.length !== 21 || w.length !== 21 || ![...p, ...w].every(finite)) return null;
  const u = sub(w[5], w[0]),
    v = sub(w[17], w[0]);
  const cross = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const n = norm(cross);
  if (n < 1e-8) return null;
  // Unmirrored model input; outward palm normal for either handedness.
  const sign = hand.handedness === 'Right' ? 1 : -1;
  const normal = { x: (cross.x / n) * sign, y: (cross.y / n) * sign, z: (cross.z / n) * sign };
  const dx = (p[9].x - p[0].x) * frame.width,
    dy = (p[9].y - p[0].y) * frame.height;
  const palm = Math.hypot(dx, dy);
  const palmVector = sub(w[5], w[0]),
    indexVector = sub(w[8], w[5]);
  return {
    extensions: fingerExtensions(w),
    palm,
    normal,
    up: -dy / Math.max(palm, 1),
    horizontal: Math.abs(dx) / Math.max(palm, 1),
    // Detect a bow at the MCP too: a straight index can bend at its base.
    indexLift: dot(indexVector, palmVector) / Math.max(norm(indexVector) * norm(palmVector), 1e-9),
    inFrame: p.every((v) => v.x > 0.015 && v.x < 0.985 && v.y > 0.015 && v.y < 0.985),
    center: {
      x: (p[0].x + p[5].x + p[9].x + p[13].x + p[17].x) / 5,
      y: (p[0].y + p[5].y + p[9].y + p[13].y + p[17].y) / 5,
      z: 0,
    },
  };
}

export function bodyAnchor(frame: Frame) {
  if (frame.poses.length !== 1) return null;
  const p = frame.poses[0];
  if (
    p.length !== 33 ||
    ![0, 2, 5, 11, 12].every(
      (i) =>
        finite(p[i]) &&
        Number.isFinite(p[i].visibility) &&
        p[i].visibility >= 0.6 &&
        p[i].x > 0.02 &&
        p[i].x < 0.98 &&
        p[i].y > 0.02 &&
        p[i].y < 0.98,
    )
  )
    return null;
  const cx = ((p[11].x + p[12].x) / 2) * frame.width;
  const cy = ((p[11].y + p[12].y) / 2) * frame.height;
  const scale = Math.hypot((p[11].x - p[12].x) * frame.width, (p[11].y - p[12].y) * frame.height);
  if (scale < frame.width * 0.13 || scale > frame.width * 0.85) return null;
  const locate = (v: Point) => ({
    x: (v.x * frame.width - cx) / scale,
    y: (v.y * frame.height - cy) / scale,
  });
  const eyes = locate({ x: (p[2].x + p[5].x) / 2, y: (p[2].y + p[5].y) / 2, z: 0 });
  // Coarse forehead estimate from eyes, scaled to the person's shoulder width.
  return { cx, cy, scale, locate, eyes, forehead: { x: eyes.x, y: eyes.y - 0.17 } };
}
