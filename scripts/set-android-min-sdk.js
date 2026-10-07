/**
 * Set minSdkVersion in android/variables.gradle.
 *
 * @capacitor/barcode-scanner (io.ionic.libs:ionbarcode-android) requires
 * minSdk 26; Capacitor's template uses 24, which fails manifest merge.
 * android/ is generated outside the repo, so this runs after every
 * `cap sync android`. Idempotent; never lowers a higher value.
 */
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const MIN_SDK = 26;
const FILE = resolve(process.cwd(), 'android/variables.gradle');

if (!existsSync(FILE)) {
  console.error('[Android minSdk] android/variables.gradle not found. Run "npx cap add android" first.');
  process.exit(1);
}
let src = await readFile(FILE, 'utf8');
const m = src.match(/minSdkVersion\s*=\s*(\d+)/);
if (!m) {
  console.error('[Android minSdk] minSdkVersion not found in variables.gradle.');
  process.exit(1);
}
if (Number(m[1]) < MIN_SDK) {
  src = src.replace(/minSdkVersion\s*=\s*\d+/, `minSdkVersion = ${MIN_SDK}`);
  await writeFile(FILE, src);
  console.log(`[Android minSdk] minSdkVersion ${m[1]} -> ${MIN_SDK}.`);
} else {
  console.log(`[Android minSdk] minSdkVersion already ${m[1]}.`);
}
