import { describe, expect, it } from 'vitest';
import { SignRecognizer } from '../src/lib/recognition';
import { HandTracker } from '../src/lib/handTracking';
import { frame, greeting, makeHand, motionFrames } from './fixtures';
import type { SignId } from '../src/lib/types';

describe('visible progress follows confirmed movements', () => {
  it('pauses briefly on stalled recognition and earns a new hold after recovery', () => {
    const recognizer = new SignRecognizer('hello');
    motionFrames('hello')
      .slice(0, 13)
      .forEach((f) => recognizer.update(f));
    expect(recognizer.pauseTracking(1300)).toMatchObject({
      step: 2,
      trackingPaused: true,
      handCount: 0,
      holdProgress: 0,
    });
    expect(recognizer.visibleHands).toHaveLength(0);
    for (const time of [1400, 1480, 1560]) {
      expect(recognizer.update(frame(greeting(true), time))).toMatchObject({
        step: 2,
        trackingPaused: false,
        status: 'move',
      });
    }
    expect(recognizer.update(frame(greeting(true), 1640)).status).toBe('success');
  });
  it('clears progress after prolonged stalled recognition, without inventing hands', () => {
    const recognizer = new SignRecognizer('hello');
    motionFrames('hello')
      .slice(0, 13)
      .forEach((f) => recognizer.update(f));
    recognizer.pauseTracking(1200);
    expect(recognizer.pauseTracking(2300)).toMatchObject({
      step: 0,
      completedSteps: 0,
      trackingPaused: true,
      handCount: 0,
    });
    expect(recognizer.update(frame(greeting(true), 2400)).status).not.toBe('success');
  });
  for (const sign of ['hello', 'evening', 'thanks'] as SignId[]) {
    it(sign + ' exposes every stage and completion', () => {
      const recognizer = new SignRecognizer(sign);
      const results = motionFrames(sign).map((f) => recognizer.update(f));
      expect([...new Set(results.map((r) => r.completedSteps))]).toEqual([0, 1, 2, 3]);
      expect(results.every((r) => r.status === 'success' || r.step === r.completedSteps)).toBe(
        true,
      );
      expect(results.at(-1)?.completedSteps).toBe(3);
    });
  }
  it('shows step 3 immediately when the upright fingers are confirmed', () => {
    const recognizer = new SignRecognizer('hello');
    const results = motionFrames('hello')
      .slice(0, 13)
      .map((f) => recognizer.update(f));
    expect(results.at(-1)).toMatchObject({ step: 2, completedSteps: 2, demoFrame: 2 });
  });
  it('waits for the second hand without erasing the first completed step', () => {
    const recognizer = new SignRecognizer('hello');
    motionFrames('hello')
      .slice(0, 6)
      .forEach((f) => recognizer.update(f));
    for (let i = 6; i < 30; i++) {
      const result = recognizer.update(frame([makeHand('two', 0, -0.4)], i * 80));
      expect(result).toMatchObject({ step: 1, completedSteps: 1, handCount: 1, requiredHands: 2 });
    }
  });
  it('does not confuse equal handedness labels with one physical hand', () => {
    const recognizer = new SignRecognizer('hello');
    const results = motionFrames('hello').map((f) => {
      f.hands.forEach((h) => (h.handedness = 'Right'));
      return recognizer.update(f);
    });
    expect(results.at(-1)).toMatchObject({ status: 'success', handCount: 2 });
  });
  it('cannot finish with a missing second hand', () => {
    const recognizer = new SignRecognizer('hello');
    const frames = motionFrames('hello');
    frames.slice(-6).forEach((f) => f.hands.pop());
    const results = frames.map((f) => recognizer.update(f));
    expect(results.at(-1)).toMatchObject({
      step: 2,
      completedSteps: 2,
      status: 'adjust',
      handCount: 1,
      holdProgress: 0,
    });
  });
  it('clears completed steps after sustained tracking loss', () => {
    const recognizer = new SignRecognizer('hello');
    motionFrames('hello')
      .slice(0, 13)
      .forEach((f) => recognizer.update(f));
    let result;
    for (let i = 13; i < 30; i++) result = recognizer.update(frame([], i * 80));
    expect(result).toMatchObject({ step: 0, completedSteps: 0, handCount: 0 });
  });
});

describe('two physical hand tracks', () => {
  it('preserves IDs when output order changes and labels are duplicated', () => {
    const tracker = new HandTracker();
    const f = frame(greeting());
    f.hands.forEach((h) => (h.handedness = 'Right'));
    const first = tracker.update(f);
    f.timestamp = 80;
    f.hands.reverse();
    const second = tracker.update(f);
    expect(second.map((h) => h.trackId)).toEqual(first.map((h) => h.trackId).reverse());
    expect(new Set(second.map((h) => h.trackId)).size).toBe(2);
  });
  it('does not report a missing hand from its stored track', () => {
    const tracker = new HandTracker();
    const first = tracker.update(frame(greeting()));
    expect(tracker.update(frame([greeting()[0]], 80))).toHaveLength(1);
    const recovered = tracker.update(frame(greeting(), 160));
    expect(recovered.map((h) => h.trackId)).toEqual(first.map((h) => h.trackId));
  });
  it('does not count the same geometry twice', () => {
    const tracker = new HandTracker();
    const h = greeting()[0];
    expect(tracker.update(frame([h, structuredClone(h)]))).toHaveLength(1);
  });
});
