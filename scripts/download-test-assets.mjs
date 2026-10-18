import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('output/fixtures', { recursive: true });
await mkdir('output/playwright', { recursive: true });
for (const name of ['pointing_up', 'victory', 'thumb_up', 'pose']) {
  const url = `https://storage.googleapis.com/mediapipe-assets/${name}.jpg`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  await writeFile(`output/fixtures/${name}.jpg`, Buffer.from(await response.arrayBuffer()));
}
console.log(
  'Official MediaPipe test images downloaded under ignored output/fixtures. See THIRD_PARTY_NOTICES.md.',
);
