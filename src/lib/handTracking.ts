import type { Frame, Hand } from './types';

type Position = { x: number; y: number };
type Track = Position & {
  id: number;
  time: number;
  vx: number;
  vy: number;
  handedness: Hand['handedness'];
};
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);

/** Handedness is a classification, not a unique tracking ID. */
export class HandTracker {
  private tracks: Track[] = [];
  private serial = 0;

  reset() {
    this.tracks = [];
    this.serial = 0;
  }

  update(frame: Frame): Hand[] {
    const aspect = frame.width / frame.height;
    const position = (h: Hand): Position => ({
      x: ((h.landmarks[0].x + h.landmarks[5].x + h.landmarks[17].x) / 3) * aspect,
      y: (h.landmarks[0].y + h.landmarks[5].y + h.landmarks[17].y) / 3,
    });
    const candidates = frame.hands.filter(
      (h) =>
        h.landmarks.length === 21 &&
        h.landmarks.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    );
    // Suppress geometrically duplicated detections, never two equal Left/Right labels.
    const hands = candidates
      .filter(
        (h, i) =>
          !candidates
            .slice(0, i)
            .some(
              (other) =>
                distance(position(h), position(other)) < 0.025 &&
                Math.hypot(
                  (h.landmarks[0].x - other.landmarks[0].x) * aspect,
                  h.landmarks[0].y - other.landmarks[0].y,
                ) < 0.025,
            ),
      )
      .slice(0, 2);
    this.tracks = this.tracks.filter(
      (t) => frame.timestamp >= t.time && frame.timestamp - t.time <= 1000,
    );
    const points = hands.map(position);
    const cost = (point: Position, track: Track, hand: Hand) => {
      const dt = Math.min(frame.timestamp - track.time, 180);
      // Blend current location with prediction: extrapolation alone can swap
      // two approaching hands when they stop before crossing.
      return (
        distance(point, track) * 0.5 +
        distance(point, { x: track.x + track.vx * dt, y: track.y + track.vy * dt }) * 0.5 +
        (hand.handedness === track.handedness ? 0 : 0.18 * (hand.handednessScore ?? 1))
      );
    };
    let best: number[] = [],
      bestCost = Infinity;
    const assign = (i: number, chosen: number[], total: number) => {
      if (i === points.length) {
        if (total < bestCost) {
          best = chosen;
          bestCost = total;
        }
        return;
      }
      for (let t = 0; t < this.tracks.length; t++) {
        if (chosen.includes(t)) continue;
        const d = cost(points[i], this.tracks[t], hands[i]);
        if (d < 0.38) assign(i + 1, [...chosen, t], total + d);
      }
      assign(i + 1, [...chosen, -1], total + 0.4);
    };
    assign(0, [], 0);
    const seen = new Set<number>();
    const output = hands.map((hand, i) => {
      const previous = best[i] >= 0 ? this.tracks[best[i]] : undefined;
      const dt = previous ? Math.max(frame.timestamp - previous.time, 1) : 1;
      const track: Track = {
        ...points[i],
        id: previous?.id ?? ++this.serial,
        time: frame.timestamp,
        handedness: previous?.handedness ?? hand.handedness,
        vx: previous ? Math.max(-0.002, Math.min(0.002, (points[i].x - previous.x) / dt)) : 0,
        vy: previous ? Math.max(-0.002, Math.min(0.002, (points[i].y - previous.y) / dt)) : 0,
      };
      seen.add(track.id);
      if (previous) this.tracks[best[i]] = track;
      else this.tracks.push(track);
      return { ...hand, trackId: track.id };
    });
    // Retain missing tracks only for brief reacquisition. They are never returned as visible hands.
    this.tracks = [
      ...this.tracks.filter((t) => seen.has(t.id)),
      ...this.tracks.filter((t) => !seen.has(t.id)),
    ].slice(0, 2);
    return output;
  }
}
