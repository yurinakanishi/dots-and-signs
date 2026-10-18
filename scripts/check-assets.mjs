import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { models } from './vision-models.mjs';
try {
  await access('public/vendor/mediapipe/vision_bundle.js');
  await access('public/vendor/mediapipe/wasm/vision_wasm_internal.wasm');
  for (const model of models) {
    const bytes = await readFile(`public/models/${model.file}`);
    if (createHash('sha256').update(bytes).digest('hex') !== model.sha256)
      throw new Error(`${model.file} checksum mismatch`);
  }
} catch (error) {
  console.error(
    `Vision assets are missing or invalid: ${error.message}\nRun npm run models:setup first.`,
  );
  process.exitCode = 1;
}
