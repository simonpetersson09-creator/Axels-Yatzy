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

/**
 * Google's SKAdNetwork list from
 * https://developers.google.com/admob/ios/3p-skadnetworks (fetched 2026-10-22).
 * Missing IDs are appended; IDs already in Info.plist are always kept.
 */
const GOOGLE_SKADNETWORK_IDS = [
  '22mmun2rn5.skadnetwork',
  '2fnua5tdw4.skadnetwork',
  '2u9pt9hc89.skadnetwork',
  '3qcr597p9d.skadnetwork',
  '3qy4746246.skadnetwork',
  '3rd42ekr43.skadnetwork',
  '3sh42y64q3.skadnetwork',
  '4468km3ulz.skadnetwork',
  '44jx6755aq.skadnetwork',
  '47vhws6wlr.skadnetwork',
  '4dzt52r2t5.skadnetwork',
  '4fzdc2evr5.skadnetwork',
  '578prtvx9j.skadnetwork',
  '7ug5zh24hu.skadnetwork',
  '8c4e2ghe7u.skadnetwork',
  '8s468mfl3y.skadnetwork',
  '97r2b46745.skadnetwork',
  '9t245vhmpl.skadnetwork',
  'a2p9lx4jpn.skadnetwork',
  'c3frkrj4fj.skadnetwork',
  'c6k4g5qg8m.skadnetwork',
  'cp8zw746q7.skadnetwork',
  'cstr6suwn9.skadnetwork',
  'e5fvkxwrpn.skadnetwork',
  'f38h382jlk.skadnetwork',
  'gta9lk7p23.skadnetwork',
  'hs6bdukanm.skadnetwork',
  'k674qkevps.skadnetwork',
  'kbd757ywx3.skadnetwork',
  'kbmxgpxpgc.skadnetwork',
  'klf5c3l5u5.skadnetwork',
  'ludvb6z3bs.skadnetwork',
  'mlmmfzh3r3.skadnetwork',
  'n38lu8286q.skadnetwork',
  'p78axxw29g.skadnetwork',
  'ppxm28t8ap.skadnetwork',
  's39g8k73mm.skadnetwork',
  'su67r6k2v3.skadnetwork',
  't38b2kh725.skadnetwork',
  'tl55sbb4fm.skadnetwork',
  'uw77j35x4d.skadnetwork',
  'v4nxqhlyqp.skadnetwork',
  'v72qych5uu.skadnetwork',
  'v9wttpbfk9.skadnetwork',
  'vutu7akeur.skadnetwork',
  'wg4vff78zm.skadnetwork',
  'wzmmz9fp6w.skadnetwork',
  'y5ghdn5j9k.skadnetwork',
  'yclnxrl5pm.skadnetwork',
  'ydx93a7ass.skadnetwork',
];

const skadEntry = (id) =>
  `    <dict>\n      <key>SKAdNetworkIdentifier</key>\n      <string>${id}</string>\n    </dict>\n`;

function upsertSkAdNetworks(content) {
  const re = /<key>SKAdNetworkItems<\/key>\s*(?:<array\s*\/>|<array>([\s\S]*?)<\/array>)/;
  const match = content.match(re);
  if (!match) {
    const items = GOOGLE_SKADNETWORK_IDS.map(skadEntry).join('');
    console.log(`[iOS plist] Added SKAdNetworkItems with ${GOOGLE_SKADNETWORK_IDS.length} IDs.`);
    return content.replace(
      /<\/dict>\s*<\/plist>/,
      `  <key>SKAdNetworkItems</key>\n  <array>\n${items}  </array>\n</dict>\n</plist>`,
    );
  }
  const body = match[1] ?? '';
  const existing = new Set(
    [...body.matchAll(/<key>SKAdNetworkIdentifier<\/key>\s*<string>\s*([^<\s]+)\s*<\/string>/g)]
      .map((m) => m[1].toLowerCase()),
  );
  const missing = GOOGLE_SKADNETWORK_IDS.filter((id) => !existing.has(id));
  if (!missing.length) {
    console.log('[iOS plist] SKAdNetworkItems already complete.');
    return content;
  }
  console.log(`[iOS plist] Added ${missing.length} missing SKAdNetwork IDs.`);
  const newBody = `${body.replace(/\s*$/, '\n')}${missing.map(skadEntry).join('')}  `;
  return content.replace(re, `<key>SKAdNetworkItems</key>\n  <array>${newBody.startsWith('\n') ? '' : '\n'}${newBody}</array>`);
}

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
  content = upsertSkAdNetworks(content);
  await writeFile(PLIST_PATH, content, 'utf-8');

  // Verify — a silently-failed regex replace must not pass unnoticed.
  const missing = Object.keys(REQUIRED_STRING_KEYS).filter(
    (key) => !content.includes(`<key>${key}</key>`),
  );
  const missingSkad = GOOGLE_SKADNETWORK_IDS.filter((id) => !content.includes(`<string>${id}</string>`));
  if (missing.length || missingSkad.length) {
    console.error(`[iOS plist] FAILED to set required keys: ${[...missing, ...missingSkad].join(', ')}`);
    process.exit(1);
  }
  console.log('[iOS plist] All required keys present.');
}

main().catch((err) => {
  console.error('[iOS plist] Failed to update Info.plist:', err);
  process.exit(1);
});
