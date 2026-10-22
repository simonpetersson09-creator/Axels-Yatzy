import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

const fixture = `class AppOpenAdManager {
    private var appOpenAd: AppOpenAd?
    func loadAd() {
        if appOpenAd != nil {
            onLoaded()
        }
                    self.appOpenAd = ad
    }
    func showAdIfAvailable() {
        guard let ad = appOpenAd, !isShowingAd else {
            return
        }
    }
    func isAdLoaded() -> Bool {
        return appOpenAd != nil
    }
    func adDidDismissFullScreenContent() {
        appOpenAd = nil
        isShowingAd = false
    }
    func didFailToPresentFullScreenContentWithError() {
        appOpenAd = nil
        isShowingAd = false
    }
}`;

function withPatch(check: (source: string, run: () => string) => void) {
  const cwd = mkdtempSync(resolve(tmpdir(), 'app-open-patch-'));
  const script = resolve('scripts/patch-admob-app-open.js');
  const target = resolve(cwd, 'node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/AppOpen/AppOpenAdManager.swift');
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, fixture);
    const run = () => {
      execFileSync(process.execPath, [script], { cwd });
      return readFileSync(target, 'utf8');
    };
    check(run(), run);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

it('expires at four hours and checks all native cache entry points', () => {
  withPatch(source => {
    const duration = source.match(/maxAdAge: TimeInterval = (\d+) \* (\d+) \* (\d+)/);
    expect(duration).not.toBeNull();
    expect(duration?.slice(1).reduce((a, b) => a * Number(b), 1)).toBe(14_400);
    expect(source).toContain('age >= maxAdAge');
    for (const next of ['if appOpenAd != nil', 'guard let ad = appOpenAd', 'return appOpenAd != nil']) {
      expect(source).toContain(`discardExpiredAd()\n        ${next}`);
    }
    expect(source).toContain('self.appOpenAd = ad\n                    self.loadedAt = Date()');
    expect(source.match(/appOpenAd = nil\n        loadedAt = nil\n        isShowingAd = false/g)).toHaveLength(2);
  });
});

it('preserves an active presentation and is idempotent', () => {
  withPatch((source, run) => {
    expect(source).toContain('guard !isShowingAd else { return }');
    expect(source.indexOf('guard !isShowingAd')).toBeLessThan(source.indexOf('age >= maxAdAge'));
    expect(run()).toBe(source);
    expect(run()).toBe(source);
  });
});

it('runs both fixes before Capacitor sync in the existing iOS command', () => {
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  const steps = pkg.scripts['cap:sync:ios'].split(' && ');
  expect(steps.indexOf('node scripts/patch-admob-app-open.js')).toBeGreaterThanOrEqual(0);
  expect(steps.indexOf('node scripts/patch-admob-app-open.js')).toBeLessThan(steps.indexOf('npx cap sync ios'));
  expect(steps.indexOf('node scripts/patch-admob-consent.js ios')).toBeLessThan(steps.indexOf('npx cap sync ios'));
});