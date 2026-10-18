import { mkdir, open, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DAILY_SESSION_LIMIT } from './session-config.ts';

// Reserve before contacting the paid API; failed/cancelled attempts also count.
// The exclusive lock prevents two local servers from spending the same allowance.
export function createDailyLimit(path: string, now = Date.now, limit = DAILY_SESSION_LIMIT) {
  return async (): Promise<'allowed' | 'limit' | 'unavailable'> => {
    let lock;
    try {
      await mkdir(dirname(path), { recursive: true });
      lock = await open(path + '.lock', 'wx');
    } catch {
      return 'unavailable';
    }
    try {
      const day = new Date(now()).toISOString().slice(0, 10);
      let used = 0;
      try {
        const stored = JSON.parse(await readFile(path, 'utf8'));
        if (
          typeof stored.day !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(stored.day) ||
          !Number.isInteger(stored.used) ||
          stored.used < 0
        )
          return 'unavailable';
        // Fail closed if the clock moves backwards; reset only on a later UTC day.
        if (stored.day > day) return 'unavailable';
        if (stored.day === day) used = stored.used;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return 'unavailable';
      }
      if (used >= limit) return 'limit';
      await writeFile(path + '.tmp', JSON.stringify({ day, used: used + 1 }) + '\n', {
        mode: 0o600,
      });
      await rename(path + '.tmp', path);
      return 'allowed';
    } catch {
      return 'unavailable';
    } finally {
      await lock.close();
      await unlink(path + '.lock').catch(() => {});
    }
  };
}
