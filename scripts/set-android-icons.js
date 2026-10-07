/**
 * Copy the Mr.B Yatzy launcher icons into the generated Android project.
 *
 * Source image: resources/icon.png. The Android resources generated from it
 * (legacy, round and adaptive foreground for mdpi–xxxhdpi, adaptive XML and
 * background colour) are committed in resources/android/res/ and copied over
 * Capacitor's default icons after every `cap sync android`, because android/
 * is regenerated outside the repo. Idempotent.
 */
import { cp, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(process.cwd(), 'resources/android/res');
const DEST = resolve(process.cwd(), 'android/app/src/main/res');

if (!existsSync(DEST)) {
  console.error('[Android icons] android/app/src/main/res not found. Run "npx cap add android" first.');
  process.exit(1);
}
if (!existsSync(SRC)) {
  console.error('[Android icons] resources/android/res missing.');
  process.exit(1);
}
let n = 0;
for (const dir of await readdir(SRC)) {
  for (const file of await readdir(resolve(SRC, dir))) {
    await cp(resolve(SRC, dir, file), resolve(DEST, dir, file));
    n++;
  }
}
console.log(`[Android icons] Copied ${n} Mr.B Yatzy launcher icon files.`);
