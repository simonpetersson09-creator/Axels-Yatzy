import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';

const script = resolve('scripts/patch-admob-rewarded.js');
const executor = 'android/src/main/java/com/getcapacitor/community/admob/rewarded/AdRewardExecutor.java';

describe('Android Rewarded Kotlin event access', () => {
  it.each(['fresh', 'previously patched'])('patches %s 8.2.1 sources and stays idempotent', state => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'rewarded-patch-'));
    try {
      const root = resolve(cwd, 'node_modules/@capacitor-community/admob');
      const file = resolve(root, executor);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(resolve(root, 'package.json'), JSON.stringify({ version: '8.2.1' }));
      const installed = readFileSync(resolve('node_modules/@capacitor-community/admob', executor), 'utf8');
      const original = state === 'fresh'
        ? 'class AdRewardExecutor {\n    @PluginMethod\n    public void showRewardVideoAd() {}\n}'
        : installed.replace(/RewardAdPluginEvents\.INSTANCE\.get(Showed|FailedToShow|Dismissed)\(\)/g, 'RewardAdPluginEvents.$1');
      writeFileSync(file, original);
      execFileSync(process.execPath, [script, 'android'], { cwd });
      const patched = readFileSync(file, 'utf8');
      for (const event of ['Showed', 'FailedToShow', 'Dismissed']) {
        expect(patched).toContain(`RewardAdPluginEvents.INSTANCE.get${event}()`);
        expect(patched).not.toMatch(new RegExp(`RewardAdPluginEvents\\.${event}\\b`));
      }
      // The actual SDK reward and attempt identity remain untouched.
      expect(patched).toContain('notifyListenersFunction.accept(RewardAdPluginEvents.Rewarded, d)');
      expect(patched).toContain('r.put("rewarded", rewarded[0])');
      if (state === 'previously patched') {
        expect(patched).toBe(installed);
        expect(patched).toContain('public void discardPrivacyCache()');
      }
      execFileSync(process.execPath, [script, 'android'], { cwd });
      expect(readFileSync(file, 'utf8')).toBe(patched);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('runs Android Rewarded during install and before Android sync verification', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(scripts.postinstall.startsWith('node scripts/patch-admob-rewarded.js android &&')).toBe(true);
    expect(scripts['cap:patch:android'].indexOf('patch-admob-rewarded.js android')).toBeLessThan(
      scripts['cap:patch:android'].indexOf('verify-admob-patches.js android'),
    );
    expect(scripts['cap:sync:android'].indexOf('npm run cap:patch:android')).toBeLessThan(scripts['cap:sync:android'].indexOf('npx cap sync android'));
    expect(scripts.postinstall).toContain('npm run cap:patch:android');
    expect(scripts.postinstall).not.toContain('|| echo');
  });
});