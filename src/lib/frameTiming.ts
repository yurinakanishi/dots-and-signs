// Both models run on one captured image. A late result must not describe the live preview.
export const MAX_FRAME_AGE_MS = 500;

export function isFreshFrame(capturedAt: number, now: number) {
  return (
    Number.isFinite(capturedAt) &&
    Number.isFinite(now) &&
    now >= capturedAt &&
    now - capturedAt < MAX_FRAME_AGE_MS
  );
}
