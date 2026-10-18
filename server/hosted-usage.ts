import { DAILY_SESSION_LIMIT } from './session-config';
import { HINT_DAILY_LIMIT, HINT_INTERVAL_MS } from '../src/lib/practice-hints';

// Separate namespace in the existing counter table; voice usage is unchanged.
export async function reserveHostedHint(env: UsageEnv, now = Date.now()) {
  try {
    if (!env.DB) return 'unavailable';
    const day = `hint:${new Date(now).toISOString().slice(0, 10)}`;
    const result = await env.DB.prepare(
      `
      INSERT INTO live_usage (day, used, last_started_at) VALUES (?1, 1, ?2)
      ON CONFLICT(day) DO UPDATE SET used = live_usage.used + 1, last_started_at = ?2
      WHERE live_usage.used < ?3 AND ?2 - live_usage.last_started_at >= ?4
      RETURNING used
    `,
    )
      .bind(day, now, HINT_DAILY_LIMIT, HINT_INTERVAL_MS)
      .first<{ used: number }>();
    if (result) return 'allowed';
    const current = await env.DB.prepare('SELECT used FROM live_usage WHERE day = ?1')
      .bind(day)
      .first<{ used: number }>();
    return (current?.used ?? 0) >= HINT_DAILY_LIMIT ? 'limit' : 'rate';
  } catch {
    return 'unavailable';
  }
}

export type UsageEnv = {
  DB?: Pick<Env['DB'], 'prepare'>;
  LIVE_INITIAL_USAGE_DAY?: string;
  LIVE_INITIAL_USAGE_COUNT?: string;
};
export const CONNECTION_INTERVAL_MS = 90_000;

export async function reserveHostedSession(env: UsageEnv, now = Date.now()) {
  try {
    if (!env.DB) return 'unavailable';
    const day = new Date(now).toISOString().slice(0, 10);
    const seedDay = env.LIVE_INITIAL_USAGE_DAY;
    const seed = env.LIVE_INITIAL_USAGE_COUNT;
    if ((seedDay === undefined) !== (seed === undefined)) return 'unavailable';
    if (seedDay !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(seedDay) || !/^\d+$/.test(seed!))) {
      return 'unavailable';
    }
    const initial = seedDay === day ? Number(seed) : 0;
    if (!Number.isSafeInteger(initial) || initial < 0) return 'unavailable';
    // One conditional write reserves the allowance across requests and isolates.
    // A rejected, failed or cancelled paid attempt is never refunded.
    const result = await env.DB.prepare(
      `
      INSERT INTO live_usage (day, used, last_started_at)
      SELECT ?1, ?2 + 1, ?3 WHERE ?2 < ?4
      ON CONFLICT(day) DO UPDATE SET
        used = MAX(live_usage.used, ?2) + 1,
        last_started_at = ?3
      WHERE MAX(live_usage.used, ?2) < ?4
        AND ?3 - live_usage.last_started_at >= ?5
      RETURNING used
    `,
    )
      .bind(day, initial, now, DAILY_SESSION_LIMIT, CONNECTION_INTERVAL_MS)
      .first<{ used: number }>();
    if (result) return 'allowed';
    const current = await env.DB.prepare('SELECT used FROM live_usage WHERE day = ?1')
      .bind(day)
      .first<{ used: number }>();
    return Math.max(current?.used ?? 0, initial) >= DAILY_SESSION_LIMIT ? 'limit' : 'rate';
  } catch {
    return 'unavailable';
  }
}
