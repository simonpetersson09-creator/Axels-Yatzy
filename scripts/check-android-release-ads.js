/**
 * Release check: fails if the Android build would use Google's sample/test
 * AdMob IDs (publisher 3940256099942544) or is missing the real Android App ID.
 * Run after `npm run build` + `npm run cap:sync:android`.
 */
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, join } from 'path';

const SAMPLE_PUB = 'ca-app-pub-3940256099942544';
const MANIFEST = resolve('android/app/src/main/AndroidManifest.xml');
const ASSETS = resolve('android/app/src/main/assets/public');
const ADMOB_TS = resolve('src/lib/admob.ts');
let failed = false;
const fail = (m) => { console.error('FAIL:', m); failed = true; };

const src = await readFile(ADMOB_TS, 'utf8');
const ids = src.slice(src.indexOf('export const ADMOB_IDS'));
const android = ids.match(/android:\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const realUnits = [];
for (const k of ['appId', 'appOpen', 'optional']) {
  const v = android.match(new RegExp(`${k}:\\s*(null|'([^']+)')`))?.[2];
  if (!v) fail(`ADMOB_IDS.android.${k} is not set in src/lib/admob.ts`);
  else if (v.startsWith(SAMPLE_PUB)) fail(`ADMOB_IDS.android.${k} is a Google sample ID`);
  else { console.log(`OK  android.${k} = ${v}`); if (k !== 'appId') realUnits.push(v); }
}

if (!existsSync(MANIFEST)) fail('AndroidManifest.xml not found (run cap:sync:android)');
else {
  const xml = await readFile(MANIFEST, 'utf8');
  const id = xml.match(/com\.google\.android\.gms\.ads\.APPLICATION_ID"\s+android:value="([^"]+)"/)?.[1];
  if (!id) fail('AdMob APPLICATION_ID missing in AndroidManifest.xml');
  else if (id.startsWith(SAMPLE_PUB)) fail(`AndroidManifest.xml uses the SAMPLE App ID ${id}`);
  else console.log(`OK  manifest APPLICATION_ID = ${id}`);
}

// The production web bundle must use real unit IDs (test IDs only exist as a
// dev-mode fallback table). Report whether useTestAds was compiled to false.
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
if (!existsSync(ASSETS)) fail('android web assets missing (run npm run build + cap:sync:android)');
else {
  const files = await walk(ASSETS);
  const all = (await Promise.all(files.map((f) => readFile(f, 'utf8')))).join('\n');
  for (const id of realUnits) {
    if (!all.includes(id)) fail(`real Android ad unit ${id} not found in the built app`);
  }
  if (/useTestAds:\s*!0/.test(all)) fail('built app has useTestAds = true (dev build?) — run "npm run build"');
  else console.log('OK  production build (useTestAds = false)');
}

if (failed) { console.error('\nAndroid release ad check FAILED'); process.exit(1); }
console.log('\nAndroid release ad check passed — no Google sample IDs will be used.');
