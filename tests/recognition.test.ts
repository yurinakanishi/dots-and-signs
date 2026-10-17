import { describe, expect, it } from 'vitest';
import { fingerExtensions, inspectHand, RECOGNITION, SignRecognizer } from '../src/lib/recognition';
import type { Hand, SignId } from '../src/lib/types';
import { frame, makeHand } from './fixtures';

function hold(recognizer: SignRecognizer, hand: Hand, start = 0, end = 1300, step = 65) {
  let result = recognizer.update(frame(hand, start));
  for (let time = start + step; time <= end; time += step)
    result = recognizer.update(frame(hand, time));
  return result;
}

describe('unambiguous static signs', () => {
  for (const sign of ['1', '2', '3', '4', '5'] as SignId[]) {
    for (const left of [false, true])
      it(`accepts ${sign} with ${left ? 'left' : 'right'} palm held steadily`, () => {
        expect(hold(new SignRecognizer(sign), makeHand(sign, left)).status).toBe('success');
      });
    it(`does not accept any other number as ${sign}`, () => {
      for (const other of ['1', '2', '3', '4', '5'] as SignId[]) {
        if (other === sign) continue;
        expect(hold(new SignRecognizer(sign), makeHand(other)).status).not.toBe('success');
      }
    });
  }
  it('does not mistake an open palm for Japanese five', () => {
    expect(hold(new SignRecognizer('5'), makeHand('open')).status).not.toBe('success');
  });
  it('does not treat a single matching frame as success', () => {
    const recognizer = new SignRecognizer('1');
    expect(recognizer.update(frame(makeHand('1'), 0)).progress).toBe(0);
    expect(recognizer.update(frame(makeHand('1'), 100)).status).not.toBe('success');
  });
  it('is invariant to world-coordinate scale and translation', () => {
    const hand = makeHand('3');
    const original = fingerExtensions(hand.worldLandmarks);
    const transformed = fingerExtensions(
      hand.worldLandmarks.map((p) => ({ x: p.x * 2 + 4, y: p.y * 2 - 3, z: p.z * 2 + 7 })),
    );
    Object.keys(original).forEach((key) =>
      expect(transformed[key as keyof typeof original]).toBeCloseTo(
        original[key as keyof typeof original],
        6,
      ),
    );
  });
});

describe('reject uncertain observations', () => {
  it('requires exactly one hand', () => {
    const recognizer = new SignRecognizer('1');
    expect(recognizer.update(frame(null)).checks.visible).toBe(false);
    const f = frame(makeHand('1'), 100);
    f.hands.push(makeHand('1', true));
    expect(recognizer.update(f).checks.visible).toBe(false);
  });
  it('rejects tiny hands', () => {
    const hand = makeHand('1');
    hand.landmarks.forEach((p) => {
      p.x = 0.5 + (p.x - 0.5) * 0.1;
      p.y = 0.5 + (p.y - 0.5) * 0.1;
    });
    expect(hold(new SignRecognizer('1'), hand).checks.visible).toBe(false);
  });
  it('rejects clipped fingertips', () => {
    const hand = makeHand('1');
    hand.landmarks[8].y = 0.01;
    expect(hold(new SignRecognizer('1'), hand).checks.visible).toBe(false);
  });
  it('rejects invalid coordinates without throwing', () => {
    const hand = makeHand('1');
    hand.worldLandmarks[8].x = NaN;
    expect(hold(new SignRecognizer('1'), hand).status).toBe('waiting');
    hand.worldLandmarks = [];
    expect(hold(new SignRecognizer('1'), hand).status).toBe('waiting');
  });
  it('rejects the back of the hand', () => {
    const hand = makeHand('1');
    hand.handedness = 'Left';
    expect(inspectHand(hand, frame(hand))?.palmFacingCamera).toBe(false);
    expect(hold(new SignRecognizer('1'), hand).checks.orientation).toBe(false);
  });
  it('rejects an edge-on palm', () => {
    const hand = makeHand('1');
    hand.worldLandmarks.forEach((p) => {
      const x = p.x;
      p.x = p.z;
      p.z = x;
    });
    expect(hold(new SignRecognizer('1'), hand).checks.orientation).toBe(false);
  });
  it('resets after losing the hand, rather than accumulating intermittent matches', () => {
    const recognizer = new SignRecognizer('1');
    hold(recognizer, makeHand('1'), 0, 900);
    recognizer.update(frame(null, 940));
    expect(hold(recognizer, makeHand('1'), 1000, 1700).status).not.toBe('success');
  });
  it('resets after an incorrect pose', () => {
    const recognizer = new SignRecognizer('1');
    hold(recognizer, makeHand('1'), 0, 900);
    recognizer.update(frame(makeHand('2'), 940));
    expect(hold(recognizer, makeHand('1'), 1000, 1700).status).not.toBe('success');
  });
  it('does not bridge a dropped-frame gap', () => {
    const recognizer = new SignRecognizer('1');
    hold(recognizer, makeHand('1'), 0, 900);
    expect(hold(recognizer, makeHand('1'), 1300, 2000).status).not.toBe('success');
  });
  it('does not add duplicate frames toward the hold', () => {
    const recognizer = new SignRecognizer('1');
    for (let i = 0; i < 60; i++)
      expect(recognizer.update(frame(makeHand('1'), 100)).progress).toBe(0);
  });
  it('resets when switching hands', () => {
    const recognizer = new SignRecognizer('1');
    hold(recognizer, makeHand('1'), 0, 900);
    expect(hold(recognizer, makeHand('1', true), 950, 1600).status).not.toBe('success');
  });
});

describe('ten is a motion, not a fist', () => {
  it('requires an extended start followed by an index bend', () => {
    const recognizer = new SignRecognizer('10');
    expect(hold(recognizer, makeHand('1'), 0, 600).status).toBe('move');
    expect(hold(recognizer, makeHand('fist'), 650, 1100).status).toBe('success');
  });
  it('rejects starting with a fist', () => {
    expect(hold(new SignRecognizer('10'), makeHand('fist'), 0, 2500).status).not.toBe('success');
  });
  it('does not finish while the index remains straight', () => {
    expect(hold(new SignRecognizer('10'), makeHand('1'), 0, 2000).status).not.toBe('success');
  });
  it('does not keep the start through loss of tracking', () => {
    const recognizer = new SignRecognizer('10');
    hold(recognizer, makeHand('1'), 0, 600);
    recognizer.update(frame(null, 650));
    expect(hold(recognizer, makeHand('fist'), 700, 1800).status).not.toBe('success');
  });
  it('rejects moving the wrist instead of bending the finger', () => {
    const recognizer = new SignRecognizer('10');
    hold(recognizer, makeHand('1'), 0, 600);
    const hand = makeHand('fist');
    hand.landmarks.forEach((p) => {
      p.x += 0.15;
    });
    expect(hold(recognizer, hand, 650, 1200).status).not.toBe('success');
  });
  it('expires the motion sequence', () => {
    const recognizer = new SignRecognizer('10');
    hold(recognizer, makeHand('1'), 0, 600);
    const halfway = makeHand('fist');
    // Continuous non-final shape: ensure timeout rather than frame-gap reset.
    for (let t = 650; t < RECOGNITION.motionDeadlineMs + 650; t += 65)
      recognizer.update(frame(makeHand('1'), t));
    expect(hold(recognizer, halfway, 3500, 4000).status).not.toBe('success');
  });
  it('resets completion when the lesson/session changes', () => {
    const recognizer = new SignRecognizer('1');
    expect(hold(recognizer, makeHand('1')).status).toBe('success');
    recognizer.reset('2');
    expect(hold(recognizer, makeHand('1')).status).not.toBe('success');
  });
});
