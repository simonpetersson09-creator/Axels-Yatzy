/**
 * Patch android/app/src/main/AndroidManifest.xml with the AdMob App ID.
 *
 * Missing com.google.android.gms.ads.APPLICATION_ID is fatal on Android: the
 * Google Mobile Ads SDK crashes the app at startup.
 *
 * The Android App ID is read from ADMOB_IDS.android.appId in src/lib/admob.ts.
 * While it is still null, Google's official SAMPLE App ID is written so debug
 * builds start. Never ship a release with the sample ID.
 *
 * Run after `npx cap add android` / `npx cap sync android`. Idempotent.
 */
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const MANIFEST = resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml');
const ADMOB_TS = resolve(process.cwd(), 'src/lib/admob.ts');
const GOOGLE_SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const META = 'com.google.android.gms.ads.APPLICATION_ID';

async function androidAppId() {
  const src = await readFile(ADMOB_TS, 'utf8');
  const block = src.match(/android:\s*\{\s*appId:\s*(null|'([^']+)')/);
  return block && block[2] ? block[2] : null;
}

async function main() {
  if (!existsSync(MANIFEST)) {
    console.error(`[Android manifest] Not found: ${MANIFEST}. Run "npx cap add android" first.`);
    process.exit(1);
  }
  let appId = await androidAppId();
  if (!appId) {
    appId = GOOGLE_SAMPLE_APP_ID;
    console.warn('[Android manifest] WARNING: no Android AdMob App ID set in src/lib/admob.ts.');
    console.warn('[Android manifest] Using Google\'s SAMPLE App ID – OK for testing, NOT for release.');
  }
  let xml = await readFile(MANIFEST, 'utf8');
  const tag = `<meta-data android:name="${META}" android:value="${appId}"/>`;
  const re = new RegExp(`<meta-data\\s+android:name="${META.replace(/\./g, '\\.')}"[^>]*/>`);
  if (re.test(xml)) {
    xml = xml.replace(re, tag);
    console.log('[Android manifest] Updated AdMob App ID.');
  } else {
    xml = xml.replace(/<application([^>]*)>/, `<application$1>\n        ${tag}`);
    console.log('[Android manifest] Added AdMob App ID.');
  }
  await writeFile(MANIFEST, xml);
}

main().catch((e) => { console.error(e); process.exit(1); });
