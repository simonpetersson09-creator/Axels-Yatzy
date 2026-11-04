import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
const script = resolve('scripts/patch-admob-load-diagnostics.js');
const entries = [
  ['ios', 'Banner/BannerExecutor.swift', 'ios-banner.swift'],
  ['ios', 'Interstitial/AdInterstitialExecutor.swift', 'ios-interstitial.swift'],
  ['android', 'banner/BannerExecutor.java', 'android-banner.java'],
  ['android', 'interstitial/AdInterstitialExecutor.java', 'android-interstitial.java'],
] as const;
describe('SDK load diagnostic patch', () => {
  it.each(['ios', 'android'])('%s preserves presentation, rejects broken patches and is repeatable', platform => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'ad-load-patch-'));
    const root = resolve(cwd, 'node_modules/@capacitor-community/admob');
    const base = platform === 'ios' ? 'ios/Sources/AdMobPlugin' : 'android/src/main/java/com/getcapacitor/community/admob';
    try {
      const files = entries.filter(([p]) => p === platform).map(([, path, fixture]) => {
        const file = resolve(root, base, path);
        const before = readFileSync(resolve('src/lib/__fixtures__/ad-load-native', fixture), 'utf8');
        mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, before);
        return { file, before };
      });
      execFileSync(process.execPath, [script, platform], { cwd });
      const patched = files.map(({ file, before }) => {
        const after = readFileSync(file, 'utf8');
        expect(after).toContain('MRB_AD_LOAD_DIAGNOSTICS');
        const helperStart = after.indexOf('    // MRB_AD_LOAD_DIAGNOSTICS');
        const helperEnd = platform === 'ios' ? after.indexOf('\n    func ', helperStart)
          : file.endsWith('banner/BannerExecutor.java') ? after.indexOf('\n\n    public BannerExecutor(', helperStart)
          : after.indexOf('\n    public ', helperStart);
        const helper = after.slice(helperStart, helperEnd);
        expect(helper).not.toContain('responseIdentifier');
        expect(helper).not.toContain('getResponseId()');
        // All existing control-flow code is preserved once instrumentation is removed.
        let stripped = after;
        const start = stripped.indexOf('    // MRB_AD_LOAD_DIAGNOSTICS');
        let end = platform === 'ios' ? stripped.indexOf('\n    func ', start) : stripped.indexOf('\n    public ', start);
        if (file.endsWith('banner/BannerExecutor.java')) end = stripped.indexOf('\n\n    public BannerExecutor(', start);
        stripped = stripped.slice(0, start) + stripped.slice(end);
        stripped = stripped.replace('        reportLoadFailure(error, kind: "banner")\n', '')
          .replace('                    self.reportLoadFailure(error, kind: "interstitial")\n', '')
          .replace('                        reportLoadFailure(adError);\n', '')
          .replace('                            reportLoadFailure(error);\n', '');
        expect(stripped.replace(/\n{2,}/g, '\n\n')).toBe(before.replace(/\n{2,}/g, '\n\n'));
        return after;
      });
      execFileSync(process.execPath, [script, platform], { cwd });
      files.forEach(({ file }, i) => expect(readFileSync(file, 'utf8')).toBe(patched[i]));
      writeFileSync(files[0].file, patched[0].replace('"adapter_count"', '"missing"'));
      expect(() => execFileSync(process.execPath, [script, platform], { cwd, stdio: 'pipe' })).toThrow();
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});