import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const expected = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
try {
  await access('public/vendor/mediapipe/vision_bundle.js');
  await access('public/vendor/mediapipe/wasm/vision_wasm_internal.wasm');
  const model = await readFile('public/models/hand_landmarker.task');
  if (createHash('sha256').update(model).digest('hex') !== expected)
    throw new Error('Model checksum mismatch');
} catch (error) {
  console.error(
    `Vision assets are missing or invalid: ${error.message}\nRun npm run models:setup first.`,
  );
  process.exitCode = 1;
}
