import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

const fixture = readFileSync(resolve('node_modules/@capacitor-community/admob/android/src/main/java/com/getcapacitor/community/admob/appopen/AppOpenAdManager.kt'), 'utf8').replace(/[\s\S]*/, (s) => s);

it('Android App Open ads expire after four hours, idempotently, and run before sync', () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'ao-android-'));
  const target = resolve(cwd, 'node_modules/@capacitor-community/admob/android/src/main/java/com/getcapacitor/community/admob/appopen/AppOpenAdManager.kt');
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, fixture);
    const run = () => { execFileSync(process.execPath, [resolve('scripts/patch-admob-app-open-android.js')], { cwd }); return readFileSync(target, 'utf8'); };
    const first = run();
    const m = first.match(/maxAdAgeMs: Long = (\d+)L \* (\d+)L \* (\d+)L \* (\d+)L/);
    expect(m?.slice(1).reduce((a, b) => a * Number(b), 1)).toBe(14_400_000);
    expect(first.match(/appOpenAd = null\n                loadedAt = 0L/g)).toHaveLength(2);
    expect(run()).toBe(first);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
  const steps = JSON.parse(readFileSync('package.json', 'utf8')).scripts['cap:sync:android'].split(' && ');
  expect(steps.indexOf('node scripts/patch-admob-app-open-android.js')).toBeLessThan(steps.indexOf('npx cap sync android'));
  expect(steps.indexOf('node scripts/patch-admob-app-open-android.js')).toBeGreaterThanOrEqual(0);
});
