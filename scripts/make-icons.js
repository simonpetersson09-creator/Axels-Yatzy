/**
 * Regenerate every launcher icon in the repo from resources/icon.png.
 *
 * Source of truth: resources/icon.png (1024 x 1024, no transparency).
 * Outputs:
 *   - resources/android/res/**  legacy + round + adaptive foreground, mdpi..xxxhdpi
 *   - resources/ios/AppIcon.appiconset/**  full iOS icon set + Contents.json
 *   - public/{app-icon-1024,app-icon,apple-touch-icon,favicon}.png
 *
 * Run after swapping the app icon: `node scripts/make-icons.js [source.png]`
 * (pass a source file to import a new artwork; it is resized to 1024 x 1024).
 * Requires ImageMagick 7 (`magick`).
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const ROOT = process.cwd();
const MASTER = join(ROOT, 'resources', 'icon.png');
const ANDROID_RES = join(ROOT, 'resources', 'android', 'res');
const IOS_SET = join(ROOT, 'resources', 'ios', 'AppIcon.appiconset');
const PUBLIC = join(ROOT, 'public');

const run = (args) => execFileSync('magick', args, { stdio: 'inherit' });

/** Resize the master to `size`, optionally circle-masked, and write it out. */
function render(src, out, size, { circle = false, alpha = false } = {}) {
  mkdirSync(dirname(out), { recursive: true });
  const args = [src, '-colorspace', 'sRGB', '-resize', `${size}x${size}`];
  if (circle) {
    const c = size / 2;
    args.push(
      '(', '-size', `${size}x${size}`, 'xc:none', '-fill', 'white',
      '-draw', `circle ${c},${c} ${c},0`, ')',
      '-compose', 'DstIn', '-composite',
    );
  }
  args.push(...(alpha ? ['-alpha', 'set'] : ['-alpha', 'off']));
  args.push(out);
  run(args);
}

// ---------- 0. Import a new artwork into the master (optional) ----------
const source = process.argv[2];
if (source) {
  const src = resolve(ROOT, source);
  if (!existsSync(src)) {
    console.error(`[icons] source not found: ${src}`);
    process.exit(1);
  }
  mkdirSync(dirname(MASTER), { recursive: true });
  run([src, '-colorspace', 'sRGB', '-resize', '1024x1024', '-alpha', 'off', MASTER]);
  console.log('[icons] resources/icon.png updated from', source);
}
if (!existsSync(MASTER)) {
  console.error('[icons] resources/icon.png missing.');
  process.exit(1);
}

// ---------- 1. Android (committed under resources/android/res) ----------
const DENSITIES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];
for (const [dpi, size] of DENSITIES) {
  const dir = join(ANDROID_RES, `mipmap-${dpi}`);
  render(MASTER, join(dir, 'ic_launcher.png'), size, { alpha: false });
  render(MASTER, join(dir, 'ic_launcher_round.png'), size, { circle: true, alpha: true });
  // Adaptive foreground: 2.25x the legacy size, full-bleed (matches the
  // files Capacitor's own generator produced for this project).
  render(MASTER, join(dir, 'ic_launcher_foreground.png'), Math.round(size * 2.25), { alpha: true });
}
console.log('[icons] Android mipmaps regenerated (mdpi..xxxhdpi).');

// ---------- 2. iOS (committed appiconset, copied by set-ios-icons.js) ----------
rmSync(IOS_SET, { recursive: true, force: true });
mkdirSync(IOS_SET, { recursive: true });

/** [point size, scale, idiom] */
const IOS_ICONS = [
  [20, 2, 'iphone'], [20, 3, 'iphone'],
  [29, 2, 'iphone'], [29, 3, 'iphone'],
  [40, 2, 'iphone'], [40, 3, 'iphone'],
  [60, 2, 'iphone'], [60, 3, 'iphone'],
  [20, 1, 'ipad'], [20, 2, 'ipad'],
  [29, 1, 'ipad'], [29, 2, 'ipad'],
  [40, 1, 'ipad'], [40, 2, 'ipad'],
  [76, 1, 'ipad'], [76, 2, 'ipad'],
  [83.5, 2, 'ipad'],
];

const images = [];
for (const [pt, scale, idiom] of IOS_ICONS) {
  const px = Math.round(pt * scale);
  const ptStr = String(pt);
  const name = `icon_${ptStr}x${ptStr}@${scale}x.png`;
  render(MASTER, join(IOS_SET, name), px, { alpha: false });
  images.push({ size: `${ptStr}x${ptStr}`, idiom, scale: `${scale}x`, filename: name });
}
render(MASTER, join(IOS_SET, 'icon_1024x1024@1x.png'), 1024, { alpha: false });
images.push({ size: '1024x1024', idiom: 'ios-marketing', scale: '1x', filename: 'icon_1024x1024@1x.png' });

writeFileSync(
  join(IOS_SET, 'Contents.json'),
  JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n',
);
console.log(`[icons] iOS AppIcon.appiconset regenerated (${images.length} images).`);

// ---------- 3. Web / marketing copies (public/) ----------
render(MASTER, join(PUBLIC, 'app-icon-1024.png'), 1024, { alpha: false });
render(MASTER, join(PUBLIC, 'app-icon.png'), 512, { alpha: false });
render(MASTER, join(PUBLIC, 'apple-touch-icon.png'), 180, { alpha: false });
render(MASTER, join(PUBLIC, 'favicon.png'), 64, { alpha: false });
console.log('[icons] public/ icon copies updated.');

const masterSize = readFileSync(MASTER).length;
console.log(`[icons] Done. Master: resources/icon.png (${(masterSize / 1024).toFixed(0)} kB).`);
