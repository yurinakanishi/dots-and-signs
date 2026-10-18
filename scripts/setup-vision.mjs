import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { models } from './vision-models.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'node_modules/@mediapipe/tasks-vision');
const vendor = path.join(root, 'public/vendor/mediapipe');
const modelDir = path.join(root, 'public/models');
await mkdir(vendor, { recursive: true });
await mkdir(path.join(vendor, 'wasm'), { recursive: true });
await mkdir(modelDir, { recursive: true });
const licenses = path.join(root, 'public/licenses/generated');
await mkdir(licenses, { recursive: true });
for (const [pkg, name] of [
  ['react', 'react'],
  ['react-dom', 'react-dom'],
  ['lucide-react', 'lucide'],
  ['@fontsource-variable/dm-sans', 'dm-sans'],
  ['@fontsource-variable/noto-sans-jp', 'noto-sans-jp'],
]) {
  await copyFile(
    path.join(root, 'node_modules', pkg, 'LICENSE'),
    path.join(licenses, `${name}.txt`),
  );
}
// Use the CJS build in a classic Worker. MediaPipe's WASM loader uses importScripts.
await copyFile(path.join(source, 'vision_bundle.cjs'), path.join(vendor, 'vision_bundle.js'));
for (const file of await readdir(path.join(source, 'wasm'))) {
  await copyFile(path.join(source, 'wasm', file), path.join(vendor, 'wasm', file));
}
const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const model of models) {
  const modelPath = path.join(modelDir, model.file);
  let bytes = await readFile(modelPath).catch(() => null);
  if (bytes && checksum(bytes) === model.sha256) continue;
  console.log(`Downloading ${model.file} (one-time setup)…`);
  try {
    const response = await fetch(model.url, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (checksum(bytes) !== model.sha256) throw new Error('Model checksum mismatch');
    await writeFile(modelPath, bytes);
  } catch (error) {
    bytes = null;
    console.warn(
      `Model download failed: ${error.message}. Run npm run models:setup with internet access before using the camera.`,
    );
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log('Hand and pose models ready locally. Checksums verified.');
