import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDailyLimit } from '../server/usage-limit';

const directories: string[] = [];
const day = Date.UTC(2026, 9, 18, 12);
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'dots-sign-usage-'));
  directories.push(directory);
  return join(directory, 'usage.json');
}
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
      !directory.includes('dots-sign-usage-')
    )
      throw new Error('Unexpected test cleanup path');
    await rm(directory, { recursive: true, force: true });
  }
});
describe('persistent spending guard', () => {
  it('persists a separate configurable hint cap across restarts', async () => {
    const path = await fixture();
    await writeFile(path, JSON.stringify({ day: '2026-10-18', used: 59 }));
    expect(await createDailyLimit(path, () => day, 60)()).toBe('allowed');
    expect(await createDailyLimit(path, () => day, 60)()).toBe('limit');
  });
  it('blocks the eleventh attempt even across server restarts', async () => {
    const path = await fixture();
    for (let i = 0; i < 10; i++) expect(await createDailyLimit(path, () => day)()).toBe('allowed');
    expect(await createDailyLimit(path, () => day)()).toBe('limit');
    expect(JSON.parse(await readFile(path, 'utf8')).used).toBe(10);
  });
  it('resets only on a later UTC day', async () => {
    const path = await fixture();
    await writeFile(path, JSON.stringify({ day: '2026-10-18', used: 10 }));
    expect(await createDailyLimit(path, () => day - 86400000)()).toBe('unavailable');
    expect(await createDailyLimit(path, () => day + 86400000)()).toBe('allowed');
  });
  it.each(['broken', '{"day":"2026-10-18","used":-1}', '{"day":"2026-10-18","used":null}'])(
    'fails closed on invalid accounting %s',
    async (contents) => {
      const path = await fixture();
      await writeFile(path, contents);
      expect(await createDailyLimit(path, () => day)()).toBe('unavailable');
    },
  );
  it('fails closed when another process owns the allowance lock', async () => {
    const path = await fixture();
    await writeFile(path + '.lock', '');
    expect(await createDailyLimit(path, () => day)()).toBe('unavailable');
  });
  it('does not lose reservations during concurrent attempts', async () => {
    const path = await fixture();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => createDailyLimit(path, () => day)()),
    );
    const allowed = results.filter((r) => r === 'allowed').length;
    expect(allowed).toBeGreaterThan(0);
    expect(allowed).toBeLessThanOrEqual(10);
    expect(JSON.parse(await readFile(path, 'utf8')).used).toBe(allowed);
  });
});
