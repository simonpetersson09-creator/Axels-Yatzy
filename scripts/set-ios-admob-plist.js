/**
 * Patch iOS Info.plist with the keys the app needs at runtime.
 *
 * Missing keys here are fatal on iOS:
 *  - GADApplicationIdentifier  → Google AdMob SDK crashes the app on init.
 *  - NSCameraUsageDescription  → iOS terminates the process when the camera
 *                                permission prompt would appear (QR scanner).
 *
 * Run after `npx cap add ios` / `npx cap sync ios` so the native iOS project
 * exists. The script is idempotent: it adds keys if missing, or updates them
 * if already present.
 */
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const PLIST_PATH = resolve(process.cwd(), 'ios/App/App/Info.plist');

/** key → string value that must be present in Info.plist. */
const REQUIRED_STRING_KEYS = {
  GADApplicationIdentifier: 'ca-app-pub-7448540924654868~6494873071',
  NSCameraUsageDescription:
    'Kameran används endast för att skanna QR-koder när du ansluter till en väns spel.',
  NSPhotoLibraryUsageDescription:
    'Bildbiblioteket används endast om du vill välja en egen profilbild.',
};

function upsertStringKey(content, key, value) {
  const keyTag = `<key>${key}</key>`;
  if (content.includes(keyTag)) {
    const re = new RegExp(`(<key>${key}</key>\\s*)<string>[^<]*</string>`);
    console.log(`[iOS plist] Updated ${key}.`);
    return content.replace(re, `$1<string>${value}</string>`);
  }
  console.log(`[iOS plist] Added ${key}.`);
  return content.replace(
    /<\/dict>\s*<\/plist>/,
    `  <key>${key}</key>\n  <string>${value}</string>\n</dict>\n</plist>`,
  );
}

async function main() {
  if (!existsSync(PLIST_PATH)) {
    console.warn(
      `[iOS plist] Info.plist not found at ${PLIST_PATH}. Run "npx cap add ios" first, then re-run this script.`,
    );
    process.exit(0);
  }

  let content = await readFile(PLIST_PATH, 'utf-8');
  for (const [key, value] of Object.entries(REQUIRED_STRING_KEYS)) {
    content = upsertStringKey(content, key, value);
  }
  await writeFile(PLIST_PATH, content, 'utf-8');

  // Verify — a silently-failed regex replace must not pass unnoticed.
  const missing = Object.keys(REQUIRED_STRING_KEYS).filter(
    (key) => !content.includes(`<key>${key}</key>`),
  );
  if (missing.length) {
    console.error(`[iOS plist] FAILED to set required keys: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('[iOS plist] All required keys present.');
}

main().catch((err) => {
  console.error('[iOS plist] Failed to update Info.plist:', err);
  process.exit(1);
});
