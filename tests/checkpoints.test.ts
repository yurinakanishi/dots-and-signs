import { describe, expect, it } from 'vitest';
import { SignRecognizer, waitingFeedback } from '../src/lib/recognition';
import type { Frame, SignId } from '../src/lib/types';
import { frame, greeting, makeHand, motionFrames, thanks } from './fixtures';

function practice(sign: SignId, checkpoint: number) {
  const recognizer = new SignRecognizer(sign);
  let time = 0;
  let result = waitingFeedback(sign);
  const send = (input: Frame, count = 1) => {
    const results = [];
    for (let i = 0; i < count; i++) {
      time += 80;
      result = recognizer.update({ ...structuredClone(input), timestamp: time });
      results.push(result);
    }
    return results;
  };
  for (const input of motionFrames(sign)) {
    send(input);
    if (result.completedSteps === checkpoint) break;
  }
  expect(result.completedSteps).toBe(checkpoint);
  return { recognizer, send, now: () => time, result: () => result };
}

describe('earned steps are checkpoints, not a timed exam', () => {
  for (const sign of ['hello', 'evening', 'thanks'] as const) {
    for (const checkpoint of [1, 2]) {
      it(`${sign}: keeps ${checkpoint} completed steps after hands or face disappear`, () => {
        const p = practice(sign, checkpoint);
        for (const missing of [frame([]), { ...frame(greeting()), poses: [] }]) {
          const results = p.send(missing, 25);
          expect(
            results.every((r) => r.completedSteps === checkpoint && r.step === checkpoint),
          ).toBe(true);
          expect(results.every((r) => r.status !== 'success' && r.holdProgress === 0)).toBe(true);
        }
      });
      it(`${sign}: resumes step ${checkpoint + 1} with fresh motion, without re-earning earlier steps`, () => {
        const p = practice(sign, checkpoint);
        p.send(frame([]), 25);
        const finish = motionFrames(sign).at(-1)!;
        expect(
          p.send(finish, 8).every((r) => r.status !== 'success' && r.completedSteps === checkpoint),
        ).toBe(true);
        const resume =
          sign === 'hello'
            ? motionFrames(sign).slice(7)
            : sign === 'thanks'
              ? motionFrames(sign).slice(6)
              : checkpoint === 1
                ? motionFrames(sign)
                : motionFrames(sign).slice(14);
        const results = resume.flatMap((f) => p.send(f));
        expect(results.every((r) => r.completedSteps >= checkpoint)).toBe(true);
        expect(p.result().status).toBe('success');
      });
    }
    it(`${sign}: a camera pause retains progress but discards old motion baselines`, () => {
      const p = practice(sign, 2);
      expect(p.recognizer.pauseSession()).toMatchObject({
        completedSteps: 2,
        step: 2,
        handCount: 0,
        holdProgress: 0,
      });
      expect(p.send(motionFrames(sign).at(-1)!, 8).every((r) => r.status !== 'success')).toBe(true);
    });
  }
  it('does not erase step 1 during 45 seconds of trying the next hand shape', () => {
    const p = practice('hello', 1);
    const fists = frame([makeHand('fist', -0.25, 0.25), makeHand('fist', 0.25, 0.25, true)]);
    expect(p.send(fists, 570).every((r) => r.completedSteps === 1 && r.step === 1)).toBe(true);
    expect(p.send(frame(greeting()), 6).at(-1)).toMatchObject({ completedSteps: 2, step: 2 });
  });
  it('keeps progress after a long frame gap or invalid frame, without accepting the ending', () => {
    const p = practice('hello', 2);
    expect(p.recognizer.update(frame(greeting(true), p.now() + 5000))).toMatchObject({
      completedSteps: 2,
      step: 2,
      preparing: true,
    });
    expect(p.recognizer.update({ ...frame(greeting(true)), width: 0 })).toMatchObject({
      completedSteps: 2,
      step: 2,
    });
    expect(p.recognizer.update(frame(greeting(true), p.now() + 5200)).status).not.toBe('success');
  });
  it('adjusts to a moved camera/body without erasing a completed step', () => {
    const p = practice('hello', 1);
    const moved = frame(greeting());
    for (const points of [...moved.poses, ...moved.hands.map((h) => h.landmarks)]) {
      points.forEach((point) => {
        point.x += 0.15;
      });
    }
    const results = p.send(moved, 8);
    expect(results.every((r) => r.completedSteps >= 1)).toBe(true);
    expect(results.at(-1)?.completedSteps).toBe(2);
  });
  it('shows the starting pose of the current movement while retaining its checks', () => {
    for (const [sign, checkpoint, demoFrame] of [
      ['hello', 2, 1],
      ['evening', 1, 0],
      ['thanks', 2, 1],
    ] as const) {
      const p = practice(sign, checkpoint);
      p.send(frame([]), 25);
      expect(p.result()).toMatchObject({
        step: checkpoint,
        completedSteps: checkpoint,
        preparing: true,
        demoFrame,
      });
    }
  });
  it('only an explicit restart or lesson change removes the checkpoints', () => {
    const p = practice('thanks', 2);
    p.recognizer.reset();
    expect(p.send(frame(thanks(true)), 8).at(-1)?.completedSteps).toBeLessThan(2);
    p.recognizer.reset('hello');
    expect(p.send(frame(greeting(true)), 8).at(-1)).toMatchObject({ step: 0, completedSteps: 0 });
  });
  it('can position a newly tracked supporting hand during step 2 of thanks', () => {
    const p = practice('thanks', 1);
    // Keep the other hand visible while the original support track expires.
    // This is not an all-hands-lost pause, and must not lock to the old ID.
    expect(
      p.send(frame([makeHand('open', -0.65, 0.18, false, 'edge')]), 20).at(-1)?.completedSteps,
    ).toBe(1);
    expect(p.send(frame(thanks()), 8).at(-1)).toMatchObject({ completedSteps: 2, step: 2 });
  });
  for (const sign of ['hello', 'thanks'] as const) {
    it(`${sign}: repositions the starting pose inside step 3 without losing checks`, () => {
      const p = practice(sign, 2);
      const start = frame(sign === 'hello' ? greeting() : thanks());
      const finish = frame(sign === 'hello' ? greeting(true) : thanks(true));
      for (const f of [start, finish]) {
        f.hands.forEach((h) =>
          h.landmarks.forEach((point) => {
            point.x += sign === 'hello' ? 0.1 : 0.07;
          }),
        );
      }
      const preparing = p.send(start, 8);
      expect(preparing.every((r) => r.completedSteps === 2)).toBe(true);
      expect(p.send(finish, 8).at(-1)?.status).toBe('success');
    });
  }
});
