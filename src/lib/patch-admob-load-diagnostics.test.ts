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
      if (platform === 'android') {
        const banner = files[0];
        const hook = '                        reportLoadFailure(adError);\n';
        const callback = patched[0].slice(patched[0].indexOf('public void onAdFailedToLoad('));
        expect(callback.indexOf(hook)).toBeGreaterThan(callback.indexOf('return;'));
        expect(patched[0].slice(0, patched[0].indexOf('public void onAdFailedToLoad('))).not.toContain(hook);
        expect(patched[0].split(hook)).toHaveLength(2);
        // Recreate 4ef339e8: the helper marker exists, but the call is in removeBanner.
        const legacy = patched[0].replace(hook, '').replace(
          '                        final ViewGroup bannerParent = resolveViewGroup();',
          hook + '                        final ViewGroup bannerParent = resolveViewGroup();',
        );
        writeFileSync(banner.file, legacy);
        execFileSync(process.execPath, [script, platform], { cwd });
        expect(readFileSync(banner.file, 'utf8')).toBe(patched[0]);
        execFileSync(process.execPath, [script, platform], { cwd });
        expect(readFileSync(banner.file, 'utf8')).toBe(patched[0]);
        writeFileSync(banner.file, patched[0].replace('public void onAdFailedToLoad(', 'public void missingCallback('));
        expect(() => execFileSync(process.execPath, [script, platform], { cwd, stdio: 'pipe' })).toThrow();
        writeFileSync(banner.file, patched[0]);
      }
      writeFileSync(files[0].file, patched[0].replace('"adapter_count"', '"missing"'));
      expect(() => execFileSync(process.execPath, [script, platform], { cwd, stdio: 'pipe' })).toThrow();
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  // Use the real Android/Google/Capacitor classpath exported by the release
  // JavaCompile task, not Java stubs. Run in Android CI with JDK 21 on PATH:
  // MRB_ANDROID_JAVA_CLASSPATH=<release classpath> bunx vitest run <this file>
  it.skipIf(!process.env.MRB_ANDROID_JAVA_CLASSPATH)('javac rejects the old hook and compiles clean, repeated and repaired Android patches', () => {
    const classpath = process.env.MRB_ANDROID_JAVA_CLASSPATH;
    if (!classpath) throw new Error('Release Java classpath required');
    const cwd = mkdtempSync(resolve(tmpdir(), 'ad-load-javac-'));
    const base = resolve(cwd, 'node_modules/@capacitor-community/admob/android/src/main/java/com/getcapacitor/community/admob');
    try {
      const files = entries.filter(([p]) => p === 'android').map(([, path, fixture]) => {
        const file = resolve(base, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, readFileSync(resolve('src/lib/__fixtures__/ad-load-native', fixture), 'utf8'));
        return file;
      });
      const compile = () => execFileSync('javac', ['-source', '21', '-target', '21', '-cp', classpath,
        '-d', resolve(cwd, 'classes'), ...files], { cwd, stdio: 'pipe' });
      execFileSync(process.execPath, [script, 'android'], { cwd });
      compile();
      const clean = files.map(file => readFileSync(file, 'utf8'));
      execFileSync(process.execPath, [script, 'android'], { cwd });
      compile();
      files.forEach((file, i) => expect(readFileSync(file, 'utf8')).toBe(clean[i]));
      const hook = '                        reportLoadFailure(adError);\n';
      writeFileSync(files[0], clean[0].replace(hook, '').replace(
        '                        final ViewGroup bannerParent = resolveViewGroup();',
        hook + '                        final ViewGroup bannerParent = resolveViewGroup();',
      ));
      let failure = '';
      try { compile(); } catch (error) {
        if (error && typeof error === 'object' && 'stderr' in error) failure = String(error.stderr);
      }
      expect(failure).toContain('cannot find symbol');
      expect(failure).toContain('adError');
      execFileSync(process.execPath, [script, 'android'], { cwd });
      compile();
      expect(readFileSync(files[0], 'utf8')).toBe(clean[0]);
      execFileSync(process.execPath, [script, 'android'], { cwd });
      compile();
      expect(readFileSync(files[0], 'utf8')).toBe(clean[0]);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 120_000);
});