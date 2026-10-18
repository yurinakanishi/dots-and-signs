import { describe, expect, it } from 'vitest';
import { SignRecognizer, fingerExtensions, inspectHand } from '../src/lib/recognition';
import { bodyAnchor } from '../src/lib/geometry';
import type { Frame, SignId } from '../src/lib/types';
import { frame, greeting, makeHand, mirror, motionFrames, thanks } from './fixtures';

const signs: SignId[] = ['hello', 'evening', 'thanks'];
const run = (sign: SignId, frames: Frame[]) => {
  const recognizer = new SignRecognizer(sign);
  return frames.map((f) => recognizer.update(f));
};
const repeat = (f: Frame, count = 30) =>
  Array.from({ length: count }, (_, i) => ({ ...structuredClone(f), timestamp: i * 80 }));

describe('ordered greeting practice', () => {
  for (const hz of [10, 15, 30]) {
    it('confirms ordered gestures at ' + hz + ' camera results per second', () => {
      for (const sign of signs) {
        const source = motionFrames(sign),
          resampled: Frame[] = [];
        for (let time = 0; time <= source.at(-1)!.timestamp + 160; time += 1000 / hz) {
          const f = structuredClone(source[Math.min(Math.floor(time / 80), source.length - 1)]);
          resampled.push({ ...f, timestamp: time });
        }
        expect(run(sign, resampled).at(-1)?.status).toBe('success');
      }
    });
  }
  for (const sign of signs)
    for (const mirrored of [false, true]) {
      it(sign + ' requires its complete sequence, either dominant hand', () => {
        const results = run(sign, motionFrames(sign, mirrored));
        expect(results.at(-1)?.status, JSON.stringify(results)).toBe('success');
        expect(results[0].status).not.toBe('success');
      });
    }
  it('does not accept static finishing poses', () => {
    for (const sign of signs) {
      const f = motionFrames(sign).at(-1)!;
      expect(run(sign, repeat(f)).at(-1)?.status).not.toBe('success');
    }
  });
  it('does not accept reversed sequences', () => {
    for (const sign of signs)
      expect(
        run(
          sign,
          motionFrames(sign)
            .reverse()
            .map((f, i) => ({ ...f, timestamp: i * 80 })),
        ).at(-1)?.status,
      ).not.toBe('success');
  });
  it('rejects greetings without the forehead or night prelude', () => {
    for (const sign of ['hello', 'evening'] as SignId[]) {
      const frames = [...repeat(frame(greeting()), 6), ...repeat(frame(greeting(true)), 6)].map(
        (f, i) => ({ ...f, timestamp: i * 80 }),
      );
      expect(run(sign, frames).at(-1)?.status).not.toBe('success');
    }
  });
  it('does not accept a number two held at chest level as hello', () => {
    expect(run('hello', repeat(frame([makeHand('two', 0, 0.3)]))).every((r) => r.step === 0)).toBe(
      true,
    );
  });
  it('requires both index fingers to bow', () => {
    const frames = motionFrames('hello');
    frames.slice(-6).forEach((f) => (f.hands[1] = greeting()[1]));
    expect(run('hello', frames).at(-1)?.status).not.toBe('success');
  });
  it('requires hands to cross, not merely approach', () => {
    const frames = motionFrames('evening');
    frames
      .slice(7, 13)
      .forEach(
        (f) => (f.hands = [makeHand('open', -0.12, -0.52), makeHand('open', 0.12, -0.52, true)]),
      );
    expect(run('evening', frames).at(-1)?.status).not.toBe('success');
  });
  it('requires evening at face level, not at the waist', () => {
    const frames = motionFrames('evening');
    frames
      .slice(0, 13)
      .forEach((f) => f.hands.forEach((h) => h.landmarks.forEach((p) => (p.y += 0.4))));
    expect(run('evening', frames).at(-1)?.status).not.toBe('success');
  });
  it('requires the supporting hand to stay still during thanks', () => {
    const frames = motionFrames('thanks');
    frames.slice(-6).forEach((f) => (f.hands[1] = makeHand('open', 0, -0.1, true, 'down')));
    expect(run('thanks', frames).at(-1)?.status).not.toBe('success');
  });
  it('requires an upward lift, not a sideways movement', () => {
    const frames = motionFrames('thanks');
    frames.slice(-6).forEach((f) => (f.hands[0] = makeHand('open', 0.5, 0.18, false, 'edge')));
    expect(run('thanks', frames).at(-1)?.status).not.toBe('success');
  });
  it('rejects front-facing palms as the horizontal support in thanks', () => {
    const hands = thanks();
    hands[1] = makeHand('open', 0, 0.35, true);
    expect(run('thanks', repeat(frame(hands))).at(-1)?.status).not.toBe('success');
  });
});

describe('uncertainty resets rather than awarding a pass', () => {
  it('does not advance from results that arrive 600 ms after capture', () => {
    const recognizer = new SignRecognizer('hello');
    const results = motionFrames('hello').map((f) => recognizer.update(f, f.timestamp + 600));
    expect(results.every((r) => r.step === 0 && r.status !== 'success')).toBe(true);
  });
  it('does not interpret collapsed index joints as a bow', () => {
    const frames = motionFrames('hello');
    frames.slice(-6).forEach((f) => {
      f.hands.forEach((h) => {
        for (const i of [6, 7, 8]) h.worldLandmarks[i] = { ...h.worldLandmarks[5] };
      });
    });
    expect(run('hello', frames).at(-1)?.status).not.toBe('success');
  });
  it('does not interpret an unmeasurable ring finger as folded at the forehead', () => {
    const h = makeHand('two', 0, -0.4);
    h.worldLandmarks[14] = { ...h.worldLandmarks[13] };
    expect(run('hello', repeat(frame([h]))).every((r) => r.step === 0)).toBe(true);
  });
  for (const mutation of [
    'no-pose',
    'two-people',
    'low-visibility',
    'missing-hand',
    'clipped',
    'nan',
    'duplicate-detections',
  ] as const) {
    it('rejects ' + mutation, () => {
      const frames = motionFrames('thanks');
      for (const f of frames) {
        if (mutation === 'no-pose') f.poses = [];
        if (mutation === 'two-people') f.poses.push(structuredClone(f.poses[0]));
        if (mutation === 'low-visibility') f.poses[0][2].visibility = 0.2;
        if (mutation === 'missing-hand') f.hands.pop();
        if (mutation === 'clipped') f.hands[0].landmarks[8].y = 0;
        if (mutation === 'nan') f.hands[0].worldLandmarks[8].x = NaN;
        if (mutation === 'duplicate-detections')
          f.hands = [f.hands[0], structuredClone(f.hands[0])];
      }
      expect(run('thanks', frames).at(-1)?.status).not.toBe('success');
    });
  }
  it('pauses rather than discarding progress on a brief missing detection', () => {
    const frames = motionFrames('thanks');
    frames[7].hands = [];
    // Reacquisition must earn a fresh stable hold, not inherit the old timer.
    frames.splice(12, 0, ...repeat(frame(thanks()), 6));
    const results = run(
      'thanks',
      frames.map((f, i) => ({ ...f, timestamp: i * 80 })),
    );
    expect(results[7].step).toBe(1);
    expect(results[7].status).toBe('adjust');
    expect(results.at(-1)?.status).toBe('success');
  });
  it('resets on a long gap or non-increasing timestamp', () => {
    for (const delta of [-80, 1000]) {
      const frames = motionFrames('thanks');
      frames.slice(6).forEach((f) => (f.timestamp += delta));
      expect(run('thanks', frames).at(-1)?.status).not.toBe('success');
    }
  });
  it('does not retain earlier lesson state', () => {
    const recognizer = new SignRecognizer('thanks');
    motionFrames('thanks')
      .slice(0, 6)
      .forEach((f) => recognizer.update(f));
    recognizer.reset('hello');
    const result = motionFrames('thanks')
      .slice(6)
      .map((f) => recognizer.update(f));
    expect(result.at(-1)?.status).not.toBe('success');
  });
  it('does not allow a single matching frame to advance', () => {
    expect(run('hello', [frame([makeHand('two', 0, -0.4)])])[0].step).toBe(0);
  });
  it('expires an unfinished movement', () => {
    const frames = motionFrames('thanks').slice(0, 6);
    for (let i = 6; i < 410; i++)
      frames.push(frame([makeHand('fist', 0.08, 0.18), thanks()[1]], i * 80));
    for (let i = 410; i < 416; i++) frames.push(frame(thanks(true), i * 80));
    expect(run('thanks', frames).at(-1)?.status).not.toBe('success');
  });
});

describe('geometry invariants', () => {
  it('reports an invalid finger as unknown while retaining measurable fingers', () => {
    const w = makeHand('two', 0, 0).worldLandmarks;
    w[14] = { ...w[13] };
    const extensions = fingerExtensions(w);
    expect(extensions.ring).toBeNull();
    expect(extensions.index).toBeGreaterThan(0.8);
  });
  it('uses body-relative rather than fixed screen positions', () => {
    const frames = motionFrames('hello');
    frames.forEach((f) => {
      for (const points of [...f.poses, ...f.hands.map((h) => h.landmarks)])
        points.forEach((p) => {
          p.x = p.x * 0.8 + 0.14;
          p.y = p.y * 0.8 + 0.06;
        });
    });
    expect(run('hello', frames).at(-1)?.status).toBe('success');
  });
  it('world angles survive scaling and translation', () => {
    const w = makeHand('two', 0, 0).worldLandmarks;
    expect(
      fingerExtensions(w.map((p) => ({ x: p.x * 2 + 4, y: p.y * 2 - 3, z: p.z * 2 + 7 }))).index,
    ).toBeCloseTo(fingerExtensions(w).index!, 6);
  });
  it('detects MCP bending even when index interphalangeal joints stay straight', () => {
    const h = makeHand('bow', 0, 0);
    expect(fingerExtensions(h.worldLandmarks).index).toBeGreaterThan(0.8);
    expect(inspectHand(h, frame([h]))?.indexLift).toBeLessThan(0.45);
  });
  it('palm-down orientation survives mirroring', () => {
    const f = mirror(frame(thanks()));
    expect(inspectHand(f.hands[1], f)?.normal.y).toBeGreaterThan(0.45);
    expect(bodyAnchor(f)).not.toBeNull();
  });
});
