import { lessons } from './lessons';
import type { SignId } from './types';

export type Progress = { completed: Partial<Record<SignId, string>>; practiceDays: string[] };
const KEY = 'dots-sign.progress.v1';
export function readProgress(): Progress {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      completed: Object.fromEntries(
        Object.entries(parsed.completed ?? {}).filter(
          ([id, date]) => lessons.some((l) => l.id === id) && typeof date === 'string',
        ),
      ),
      practiceDays: Array.isArray(parsed.practiceDays)
        ? parsed.practiceDays.filter(
            (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d),
          )
        : [],
    };
  } catch {
    return { completed: {}, practiceDays: [] };
  }
}
export function recordCompletion(previous: Progress, id: SignId): Progress {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const next = {
    completed: { ...previous.completed, [id]: now.toISOString() },
    practiceDays: [...new Set([...previous.practiceDays, day])],
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Storage may be disabled; keep the session usable. */
  }
  return next;
}
export function clearProgress() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* In-memory reset still works. */
  }
  return { completed: {}, practiceDays: [] } as Progress;
}
