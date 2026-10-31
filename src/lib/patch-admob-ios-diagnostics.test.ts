import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';

it('native diagnostics patch is idempotent and leaves real SDK calls and privacy guards unchanged', () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'ios-diagnostic-test-'));
  const base = 'node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/';
  const names = ['AdMobPlugin.swift', 'Consent/ConsentExecutor.swift', 'AppOpen/AppOpenAdPlugin.swift', 'AppOpen/AppOpenAdManager.swift'];
  const source = (name: string) => readFileSync(resolve(base, name), 'utf8');
  try {
    for (const name of names) {
      const dest = resolve(cwd, base, name); mkdirSync(dirname(dest), { recursive: true });
      // Use explicit unpatched minimal SDK anchors, not installed patch state.
      const text = name === 'AdMobPlugin.swift' ? `        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
    private let appOpenAdPlugin = AppOpenAdPlugin()
        appOpenAdPlugin.loadAppOpen(
            notify: { [weak self] eventName, data in
            self.consentExecutor.requestConsentInfo(call, params)
                call.resolve([:])
            })`
        : name === 'Consent/ConsentExecutor.swift' ? `                if error != nil {
                        call.resolve([
                        call.reject("Request consent info failed")`
        : name === 'AppOpen/AppOpenAdPlugin.swift' ? `        notify: @escaping (String, [String: Any]) -> Void
        preparedManagers.removeAll()
            self.preparedManagers[adUnitId]?.loadAd(onLoaded:
                call.reject(message)
            }, onPaidEvent:`
        : `    public func loadAd(onLoaded:
        discardExpiredAd()
        if appOpenAd != nil {
            onLoaded()
        isLoadingAd = true
                let ad = try await AppOpenAd.load(with: self.adUnitId, request: Request())
                    self.appOpenAd = ad
                    self.loadedAt = Date()
                    onFailed(error)
        if age < 0 || age >= maxAdAge {
        return appOpenAd != nil
        ad.present(from: rootViewController)
        let onOpened = self.onOpened
        appOpenAd = nil
        loadedAt = nil
        isShowingAd = false
    public func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        appOpenAd = nil
    private var onClosed:
extension AppOpenAdManager: FullScreenContentDelegate {`;
      writeFileSync(dest, text);
    }
    const script = resolve('scripts/patch-admob-ios-diagnostics.js');
    execFileSync(process.execPath, [script], { cwd });
    const first = names.map(n => readFileSync(resolve(cwd, base, n), 'utf8'));
    execFileSync(process.execPath, [script], { cwd });
    expect(names.map(n => readFileSync(resolve(cwd, base, n), 'utf8'))).toEqual(first);
    expect(first[3]).toContain('diagnostic("load_requested")\n                let ad = try await AppOpenAd.load(with: self.adUnitId, request: Request())');
    expect(first[3]).toContain('adDidRecordImpression');
    expect(first[2]).toContain('call.reject(message, nil, nil, details)');
    expect(first[3]).toContain('domain == "com.google.admob" && nsError.code == 1 ? "load_no_fill"');
    expect(first[3]).toContain('noteCachedAd("cache_discarded", reason: "consumed")');
    expect(first[3]).toContain('noteCachedAd("presentation_requested")');
    expect(first.join('')).not.toContain('advertisingIdentifier');
    expect(first.join('')).not.toContain('ConsentInformation.shared.reset');
    // The installed source also keeps existing eligibility and cache expiry protections.
    expect(source('AppOpen/AppOpenAdManager.swift')).toContain('age >= maxAdAge');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});