/**
 * Copy the committed Mr.B Yatzy iOS icon set into the generated Xcode project.
 *
 * ios/ is regenerated outside the repo by `npx cap sync ios`, so the icon set
 * is committed under resources/ios/AppIcon.appiconset and copied over here
 * after every sync. Idempotent, mirrors scripts/set-android-icons.js.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const SRC = resolve(process.cwd(), 'resources', 'ios', 'AppIcon.appiconset');
const CATALOG = resolve(process.cwd(), 'ios', 'App', 'App', 'Assets.xcassets');
const DEST = join(CATALOG, 'AppIcon.appiconset');

if (!existsSync(SRC)) {
  console.error('[iOS icons] resources/ios/AppIcon.appiconset missing. Run "node scripts/make-icons.js".');
  process.exit(1);
}
if (!existsSync(CATALOG)) {
  console.error('[iOS icons] ios/App/App/Assets.xcassets not found. Run "npx cap add ios" first.');
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });
let n = 0;
for (const file of readdirSync(SRC)) {
  cpSync(join(SRC, file), join(DEST, file));
  n++;
}
console.log(`[iOS icons] Copied ${n} Mr.B Yatzy icon files into AppIcon.appiconset.`);
