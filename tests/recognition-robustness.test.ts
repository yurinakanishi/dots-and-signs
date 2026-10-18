import { describe, expect, it } from 'vitest';
import { SignRecognizer } from '../src/lib/recognition';
import type { Frame, SignId } from '../src/lib/types';
import { frame, makeHand, mirror, motionFrames } from './fixtures';

const run = (sign: SignId, frames: Frame[]) => {
  const recognizer = new SignRecognizer(sign);
  return frames.map((f, i) => recognizer.update({ ...f, timestamp: i * 80 }));
};
const hideFace = (f: Frame) => {
  for (const i of [0, 2, 5]) f.poses[0][i].visibility = 0.1;
};

describe('recognition failure reproductions', () => {
  it('locates the forehead from the eyes when the raised hand hides the nose', () => {
    const frames = motionFrames('hello').slice(0, 6);
    frames.forEach((f) => {
      f.poses[0][0].visibility = 0.1;
    });
    expect(run('hello', frames).at(-1)?.completedSteps).toBe(1);
  });
  for (const degrees of [-90, 90]) {
    for (const mirrored of [false, true]) {
      it(`accepts two fingertips at the forehead with wrist rotation ${degrees}, mirror=${mirrored}`, () => {
        const h = makeHand('two', 0, -0.4);
        const tip = {
          x: (h.landmarks[8].x + h.landmarks[12].x) * 640,
          y: (h.landmarks[8].y + h.landmarks[12].y) * 360,
        };
        const angle = (degrees * Math.PI) / 180;
        const rotate = (x: number, y: number) => ({
          x: x * Math.cos(angle) - y * Math.sin(angle),
          y: x * Math.sin(angle) + y * Math.cos(angle),
        });
        h.landmarks.forEach((p) => {
          const next = rotate(p.x * 1280 - tip.x, p.y * 720 - tip.y);
          p.x = (next.x + tip.x) / 1280;
          p.y = (next.y + tip.y) / 720;
        });
        h.worldLandmarks.forEach((p) => Object.assign(p, rotate(p.x, p.y)));
        const frames = Array.from({ length: 6 }, () => frame([h]));
        expect(run('hello', mirrored ? frames.map(mirror) : frames).at(-1)?.completedSteps).toBe(1);
      });
    }
  }

  it('allows a lowered head during the greeting after locating the forehead', () => {
    const frames = motionFrames('hello');
    frames.slice(6).forEach(hideFace);
    expect(run('hello', frames).at(-1)?.status).toBe('success');
  });

  it('does not use an unseen face to locate the initial forehead pose', () => {
    const frames = motionFrames('hello');
    frames.forEach(hideFace);
    expect(run('hello', frames).at(-1)?.completedSteps).toBe(0);
  });

  it('requires current shoulders even when the face is unnecessary', () => {
    const frames = motionFrames('hello');
    frames.slice(6).forEach((f) => {
      f.poses[0][11].visibility = 0.1;
    });
    expect(run('hello', frames).at(-1)?.completedSteps).toBe(1);
  });

  it('ignores a clipped resting hand when the forehead step needs only one hand', () => {
    const frames = motionFrames('hello').slice(0, 6);
    frames.forEach((f) => {
      const resting = makeHand('fist', 0.8, 0.7, true);
      resting.landmarks[20].y = 1.02;
      f.hands.push(resting);
    });
    expect(run('hello', frames).at(-1)?.completedSteps).toBe(1);
  });

  it('still rejects a clipped hand when both hands are required', () => {
    const frames = motionFrames('hello');
    frames.slice(6).forEach((f) => {
      f.hands[1].landmarks[20].y = 1.02;
    });
    expect(run('hello', frames).at(-1)?.completedSteps).toBe(1);
  });

  it('can confirm a sustained pose despite one isolated bad estimate', () => {
    const frames = Array.from({ length: 8 }, (_, i) =>
      frame([makeHand(i === 3 ? 'index' : 'two', 0, -0.4)]),
    );
    expect(run('hello', frames).at(-1)?.completedSteps).toBe(1);
  });

  for (const hz of [5, 10, 15, 30]) {
    it(`tolerates one noisy result at ${hz} results per second`, () => {
      const recognizer = new SignRecognizer('hello');
      const results = Array.from({ length: Math.ceil(hz * 1.4) }, (_, i) =>
        recognizer.update(frame([makeHand(i === 2 ? 'index' : 'two', 0, -0.4)], (i * 1000) / hz)),
      );
      expect(results.at(-1)?.completedSteps).toBe(1);
      expect(results[2].completedSteps).toBe(0);
    });
  }

  it('does not accumulate intermittent matches into a valid hold', () => {
    const frames = Array.from({ length: 30 }, (_, i) =>
      frame([makeHand(i % 2 ? 'index' : 'two', 0, -0.4)]),
    );
    expect(run('hello', frames).at(-1)?.completedSteps).toBe(0);
  });

  it('does not award a step on a nonmatching final frame', () => {
    const frames = Array.from({ length: 5 }, (_, i) =>
      frame([makeHand(i === 4 ? 'index' : 'two', 0, -0.4)]),
    );
    expect(run('hello', frames).at(-1)?.completedSteps).toBe(0);
  });
});
