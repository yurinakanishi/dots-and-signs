import { describe, expect, it } from 'vitest';
import { fingerExtensions, inspectHand, SignRecognizer } from '../src/lib/recognition';
import type { Frame, Hand, Point, SignId } from '../src/lib/types';
import { frame, greeting, makeHand, mirror, motionFrames } from './fixtures';

// Keep image and world coordinates aligned when changing the synthetic anatomy.
function moveJoint(hand: Hand, index: number, point: Point) {
  const previous = hand.worldLandmarks[index];
  const image = hand.landmarks[index];
  hand.landmarks[index] = {
    x: image.x + ((point.x - previous.x) * 900) / 1280,
    y: image.y + ((point.y - previous.y) * 900) / 720,
    z: point.z,
  };
  hand.worldLandmarks[index] = point;
}

function curlFinger(hand: Hand, start: number, jointAngle: number) {
  const w = hand.worldLandmarks;
  const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const first = length(w[start], w[start + 1]);
  const second = length(w[start + 1], w[start + 2]);
  const third = length(w[start + 2], w[start + 3]);
  const direction = {
    x: (w[start + 1].x - w[start].x) / first,
    y: (w[start + 1].y - w[start].y) / first,
    z: (w[start + 1].z - w[start].z) / first,
  };
  const planarLength = Math.hypot(direction.x, direction.y);
  const side = { x: -direction.y / planarLength, y: direction.x / planarLength, z: 0 };
  const bend = ((180 - jointAngle) * Math.PI) / 180;
  for (const [offset, distance] of [
    [2, second],
    [3, second + third],
  ]) {
    const point = { ...w[start + 1] };
    for (const axis of ['x', 'y', 'z'] as const)
      point[axis] += distance * (direction[axis] * Math.cos(bend) + side[axis] * Math.sin(bend));
    moveJoint(hand, start + offset, point);
  }
}

function openThumb(hand: Hand) {
  const direction = hand.handedness === 'Left' ? -1 : 1;
  for (const i of [1, 2, 3, 4])
    moveJoint(hand, i, { x: direction * (0.02 + i * 0.02), y: 0.05, z: 0 });
}

function tiltIndex(hand: Hand, degrees: number) {
  const base = hand.worldLandmarks[5];
  const radians = (degrees * Math.PI) / 180;
  for (const i of [6, 7, 8]) {
    const point = hand.worldLandmarks[i];
    const dy = point.y - base.y;
    moveJoint(hand, i, {
      x: point.x,
      y: base.y + dy * Math.cos(radians),
      z: base.z + dy * Math.sin(radians),
    });
  }
}

const run = (sign: SignId, frames: Frame[]) => {
  const recognizer = new SignRecognizer(sign);
  return frames.map((f, i) => recognizer.update({ ...f, timestamp: i * 80 }));
};
const hold = (hands: Hand[], count = 8) => Array.from({ length: count }, () => frame(hands));

describe('forgiving finger poses', () => {
  for (const sign of ['hello', 'evening', 'thanks'] as const) {
    for (const mirrored of [false, true]) {
      it(`${sign} accepts slightly curved raised fingers and loosely folded fingers${mirrored ? ' mirrored' : ''}`, () => {
        const frames = motionFrames(sign);
        for (const f of frames) {
          for (const h of f.hands) {
            const extensions = fingerExtensions(h.worldLandmarks);
            for (const [finger, start] of [
              ['index', 5],
              ['middle', 9],
              ['ring', 13],
              ['pinky', 17],
            ] as const) {
              curlFinger(h, start, extensions[finger]! > 0.8 ? 124 : 130);
            }
          }
        }
        expect(run(sign, mirrored ? frames.map(mirror) : frames).at(-1)?.status).toBe('success');
      });
    }
  }

  it('does not require the thumb to be tucked during hello or the greeting', () => {
    for (const sign of ['hello', 'evening'] as const) {
      const frames = motionFrames(sign);
      frames.forEach((f) => f.hands.forEach(openThumb));
      expect(fingerExtensions(frames.at(-1)!.hands[0].worldLandmarks).thumb).toBeGreaterThan(0.9);
      expect(run(sign, frames).at(-1)?.status).toBe('success');
    }
  });

  it('accepts a shallow bow at the index base', () => {
    const frames = motionFrames('hello').slice(0, -6);
    const hands = greeting();
    hands.forEach((h) => tiltIndex(h, 50));
    expect(inspectHand(hands[0], frame(hands))!.indexLift).toBeGreaterThan(0.45);
    expect(run('hello', [...frames, ...hold(hands)]).at(-1)?.status).toBe('success');
  });

  it('accepts a shallow bow at the middle index joint', () => {
    const frames = motionFrames('hello').slice(0, -6);
    const hands = greeting();
    hands.forEach((h) => curlFinger(h, 5, 128));
    expect(fingerExtensions(hands[0].worldLandmarks).index).toBeGreaterThan(0.55);
    expect(run('hello', [...frames, ...hold(hands)]).at(-1)?.status).toBe('success');
  });

  for (const shape of ['curved', 'tilted'] as const) {
    it(`does not complete a bow from an unchanged ${shape} starting pose`, () => {
      const hands = greeting();
      hands.forEach((h) => (shape === 'curved' ? curlFinger(h, 5, 128) : tiltIndex(h, 50)));
      const results = run('hello', [...motionFrames('hello').slice(0, 7), ...hold(hands, 30)]);
      expect(results.at(-1)).toMatchObject({ completedSteps: 2, status: 'move' });
    });
  }

  it('does not mistake tiny changes in a curved starting pose for a bow', () => {
    const hands = greeting();
    hands.forEach((h) => curlFinger(h, 5, 128));
    const jitter = greeting();
    jitter.forEach((h) => curlFinger(h, 5, 124));
    expect(
      run('hello', [...motionFrames('hello').slice(0, 7), ...hold(hands), ...hold(jitter)]).at(-1),
    ).toMatchObject({ completedSteps: 2, status: 'move' });
  });

  it('still requires two raised fingers at the forehead', () => {
    expect(run('hello', hold([makeHand('index', 0, -0.4)])).at(-1)?.completedSteps).toBe(0);
  });
});
