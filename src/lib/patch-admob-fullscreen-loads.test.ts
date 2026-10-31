import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const script = resolve('scripts/patch-admob-fullscreen-loads.js');
const fixtures = resolve('src/lib/__fixtures__/fullscreen-native');
const entries = [
  ['ios', 'Interstitial/AdInterstitialExecutor.swift', 'prepareInterstitial', 'InterstitialAd'],
  ['ios', 'Rewarded/AdRewardExecutor.swift', 'prepareRewardVideoAd', 'RewardedAd'],
  ['android', 'interstitial/AdInterstitialExecutor.java', 'prepareInterstitial', 'InterstitialAd'],
  ['android', 'rewarded/AdRewardExecutor.java', 'prepareRewardVideoAd', 'RewardedAd'],
] as const;

describe('native fullscreen SDK load ownership patch', () => {
  it.each(entries)('%s %s guards the actual SDK boundary and both results, preserves presentation and is idempotent', (platform, entry, method, adType) => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'fullscreen-patch-'));
    const base = platform === 'ios' ? 'ios/Sources/AdMobPlugin/' : 'android/src/main/java/com/getcapacitor/community/admob/';
    const root = resolve(cwd, 'node_modules/@capacitor-community/admob');
    try {
      // Frozen pristine 8.2.1 executors, with the existing privacy boundary
      // applied exactly as the privacy patch does. Never depend on install state.
      for (const [p, path, m] of entries.filter(([p]) => p === platform)) {
        let source = readFileSync(resolve(fixtures, path.split('/').pop() ?? ''), 'utf8');
        if (p === 'ios') {
          source = source.replace('    private var preparedAds:', `    private var privacyGeneration = 0
    func discardPrivacyCache() { privacyGeneration += 1; preparedAds.removeAll(); lastPreparedAdId = nil }
    private var preparedAds:`);
          // Use the real multiline privacy discard, so the load patch can add detach.
          source = source.replace('    func discardPrivacyCache() { privacyGeneration += 1; preparedAds.removeAll(); lastPreparedAdId = nil }', '    func discardPrivacyCache() {\n        privacyGeneration += 1\n        preparedAds.removeAll()\n        lastPreparedAdId = nil\n    }');
          source = source.replace(`    func ${m}(_ call: CAPPluginCall, _ request: Request, _ adUnitID: String) {`, `    func ${m}(_ call: CAPPluginCall, _ request: Request, _ adUnitID: String) {\n        let generation = privacyGeneration`);
          source = source.replace('completionHandler: { (ad, error) in', 'completionHandler: { (ad, error) in\n                guard generation == self.privacyGeneration else {\n                    call.reject("Ad invalidated by privacy change")\n                    return\n                }');
          if (path.startsWith('Rewarded')) {
            // The preceding rewarded patch provides this marker; show body stays
            // pristine here so byte equality verifies that load patch is isolated.
            source = source.replace('    func showRewardVideoAd(', '    // LOVABLE_ATTEMPT_PATCH\n    func showRewardVideoAd(');
          }
        } else {
          source = source.replace('    public static String lastPreparedAdId;', `    public static String lastPreparedAdId;
    public static int privacyGeneration = 0;
    public void discardPrivacyCache() {
        privacyGeneration++;
        preparedAds.clear();
        lastPreparedAdId = null;
    }`);
        }
        const file = resolve(root, base, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, source);
      }
      const file = resolve(root, base, entry);
      const before = readFileSync(file, 'utf8');
      const showMarker = platform === 'ios' ? '    func show' : '    public void show';
      const show = before.slice(before.indexOf(showMarker));
      execFileSync(process.execPath, [script, platform], { cwd });
      const after = readFileSync(file, 'utf8');
      expect(after.slice(after.indexOf(showMarker))).toBe(show);
      const requestAt = after.indexOf(`${adType}.load(`);
      const preflight = platform === 'ios' ? 'guard generation == self.privacyGeneration else' : 'if (generation != privacyGeneration)';
      expect(after.indexOf(preflight)).toBeGreaterThan(0);
      expect(after.indexOf(preflight)).toBeLessThan(requestAt);
      const pendingReuse = platform === 'ios' ? 'pending.calls.append(call)' : 'pending.calls.add(call)';
      expect(after.indexOf(pendingReuse)).toBeLessThan(requestAt);
      const outcomes = after.slice(requestAt);
      if (platform === 'ios') {
        expect(outcomes.indexOf('self.pendingLoads[adUnitID] === owner')).toBeLessThan(outcomes.indexOf('if let error'));
        expect(outcomes.indexOf('self.pendingLoads[adUnitID] === owner')).toBeLessThan(outcomes.indexOf('self.preparedAds[adUnitID] = ad'));
        expect(after).toContain('if self.pendingLoads[adUnitID] === owner { self.pendingLoads.removeValue');
        expect(outcomes).toContain('finish("Ad invalidated by privacy change", nil)');
      } else {
        for (const callback of ['onAdLoaded', 'onAdFailedToLoad']) {
          const body = outcomes.slice(outcomes.indexOf(`@Override public void ${callback}`));
          expect(body.indexOf('pendingLoads.get(id) != owner')).toBeLessThan(body.indexOf(`delegate.${callback}`));
        }
        expect(after).toContain('if (pendingLoads.get(id) == owner) pendingLoads.remove(id)');
        expect(after).toContain('failLoad(id, owner, "Ad invalidated by privacy change")');
      }
      expect(after).not.toContain('setTimeout'); expect(after).not.toContain('cancelLoad');
      execFileSync(process.execPath, [script, platform], { cwd });
      expect(readFileSync(file, 'utf8')).toBe(after);
      // Broken partial ownership must block rather than silently pass.
      writeFileSync(file, after.replace(pendingReuse, 'missingReuse(call)'));
      expect(() => execFileSync(process.execPath, [script, platform], { cwd, stdio: 'pipe' })).toThrow();
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});