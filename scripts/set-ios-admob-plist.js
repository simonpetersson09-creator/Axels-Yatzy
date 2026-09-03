/**
 * Patch iOS Info.plist with the real AdMob App ID (GADApplicationIdentifier).
 *
 * Run after `npx cap add ios` / `npx cap sync ios` so the native iOS project
 * exists. The script is idempotent: it adds the key if missing, or updates it
 * if already present.
 */
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const APP_ID_IOS = 'ca-app-pub-7448540924654868~6494873071';
const PLIST_PATH = resolve(process.cwd(), 'ios/App/App/Info.plist');

async function main() {
  if (!existsSync(PLIST_PATH)) {
    console.warn(
      `[AdMob] Info.plist not found at ${PLIST_PATH}. Run "npx cap add ios" first, then re-run this script.`
    );
    process.exit(0);
  }

  let content = await readFile(PLIST_PATH, 'utf-8');

  if (content.includes('<key>GADApplicationIdentifier</key>')) {
    content = content.replace(
      /(<key>GADApplicationIdentifier<\/key>\s*)<string>[^<]*<\/string>/,
      `$1<string>${APP_ID_IOS}</string>`
    );
    console.log('[AdMob] Updated existing GADApplicationIdentifier.');
  } else {
    content = content.replace(
      /<\/dict>\s*<\/plist>/,
      `  <key>GADApplicationIdentifier</key>\n  <string>${APP_ID_IOS}</string>\n</dict>\n</plist>`
    );
    console.log('[AdMob] Added GADApplicationIdentifier to Info.plist.');
  }

  await writeFile(PLIST_PATH, content, 'utf-8');
}

main().catch((err) => {
  console.error('[AdMob] Failed to update Info.plist:', err);
  process.exit(1);
});
