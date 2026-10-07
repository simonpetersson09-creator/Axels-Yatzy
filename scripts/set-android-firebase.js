/**
 * Wire Firebase Cloud Messaging into the generated Android project.
 *
 * android/ is regenerated outside the repo, so google-services.json is kept at
 * firebase/google-services.json (git-ignored, lives only on your machine) and
 * copied in after every `cap sync android`. Idempotent.
 *
 *  1. Copies firebase/google-services.json -> android/app/google-services.json.
 *  2. Makes sure the Google Services Gradle plugin is on the classpath and is
 *     applied when that file exists (Capacitor's template normally does both).
 *  3. Writes assets/public/native-push-config.json so the app only calls
 *     PushNotifications.register() when Firebase is really configured —
 *     without it, register() would crash the app.
 *
 * Missing google-services.json is NOT an error: the build still works, push
 * is simply disabled on Android.
 */
import { readFile, writeFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const SRC_JSON = resolve(process.cwd(), 'firebase/google-services.json');
const ANDROID = resolve(process.cwd(), 'android');
const DEST_JSON = resolve(ANDROID, 'app/google-services.json');
const ROOT_GRADLE = resolve(ANDROID, 'build.gradle');
const APP_GRADLE = resolve(ANDROID, 'app/build.gradle');
const PUBLIC_DIR = resolve(ANDROID, 'app/src/main/assets/public');
const FLAG_FILE = resolve(PUBLIC_DIR, 'native-push-config.json');
const PACKAGE = 'com.simonpetersson.axelsyatzy';

async function ensureGradle() {
  if (existsSync(ROOT_GRADLE)) {
    let g = await readFile(ROOT_GRADLE, 'utf8');
    if (!g.includes('com.google.gms:google-services')) {
      g = g.replace(/dependencies\s*\{/, (m) => `${m}\n        classpath 'com.google.gms:google-services:4.4.2'`);
      await writeFile(ROOT_GRADLE, g);
      console.log('[Android Firebase] Added google-services classpath.');
    }
  }
  if (existsSync(APP_GRADLE)) {
    let g = await readFile(APP_GRADLE, 'utf8');
    if (!g.includes('com.google.gms.google-services')) {
      g += `
try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
`;
      await writeFile(APP_GRADLE, g);
      console.log('[Android Firebase] Added conditional google-services plugin.');
    }
  }
}

async function main() {
  if (!existsSync(ANDROID)) {
    console.error('[Android Firebase] android/ not found. Run "npx cap add android" first.');
    process.exit(1);
  }
  await ensureGradle();

  let configured = false;
  if (existsSync(SRC_JSON)) {
    const raw = await readFile(SRC_JSON, 'utf8');
    let ok = false;
    try {
      const j = JSON.parse(raw);
      ok = (j.client ?? []).some((c) => c?.client_info?.android_client_info?.package_name === PACKAGE);
    } catch { /* invalid JSON */ }
    if (!ok) {
      console.warn(`[Android Firebase] WARNING: firebase/google-services.json has no Android app "${PACKAGE}". Push disabled.`);
    } else {
      await copyFile(SRC_JSON, DEST_JSON);
      configured = true;
      console.log('[Android Firebase] Copied google-services.json into android/app/.');
    }
  } else {
    console.warn('[Android Firebase] firebase/google-services.json missing — Android push disabled (app still runs).');
  }

  if (existsSync(PUBLIC_DIR)) {
    await writeFile(FLAG_FILE, JSON.stringify({ androidFcm: configured }));
  } else {
    console.warn('[Android Firebase] assets/public missing — run "npm run build" and "npx cap sync android" first.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
