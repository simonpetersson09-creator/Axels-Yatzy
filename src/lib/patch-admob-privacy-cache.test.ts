import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';

it('applies and verifies both native privacy boundaries idempotently', () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'privacy-patch-'));
  const root = resolve(cwd, 'node_modules/@capacitor-community/admob');
  const ios = 'ios/Sources/AdMobPlugin/';
  const android = 'android/src/main/java/com/getcapacitor/community/admob/';
  const fixtures: Record<string, string> = {
    [ios + 'Interstitial/AdInterstitialExecutor.swift']: '    private var preparedAds: [String: InterstitialAd] = [:]\n    func prepareInterstitial(_ call: CAPPluginCall, _ request: Request, _ adUnitID: String) {\ncompletionHandler: { (ad, error) in',
    [ios + 'Rewarded/AdRewardExecutor.swift']: '    private var preparedAds: [String: RewardedAd] = [:]\n    func prepareRewardVideoAd(_ call: CAPPluginCall, _ request: Request, _ adUnitID: String) {\ncompletionHandler: { (ad, error) in',
    [ios + 'Banner/BannerExecutor.swift']: '    func showBanner(\n    func bannerViewDidReceiveAd(_ bannerView: BannerView) {\n    func bannerViewDidRecordImpression(_ bannerView: BannerView) {',
    [ios + 'AppOpen/AppOpenAdPlugin.swift']: '    private var preparedManagers: [String: AppOpenAdManager] = [:]\n        DispatchQueue.main.async {\n            self.preparedManagers[adUnitId]?.loadAd(onLoaded: {\n            }, onFailed: { error in',
    [ios + 'AdMobPlugin.swift']: '        CAPPluginMethod(name: "requestConsentInfo", returnType: CAPPluginReturnPromise),\n    @objc func requestConsentInfo(',
    [android + 'interstitial/InterstitialAdCallbackAndListeners.kt']: 'fun getInterstitialAdLoadCallback() {\n        return object : InterstitialAdLoadCallback() {\n            override fun onAdLoaded(ad: InterstitialAd) {\n            override fun onAdFailedToLoad(adError: LoadAdError) {',
    [android + 'rewarded/RewardedAdCallbackAndListeners.kt']: 'fun getRewardedAdLoadCallback() {\n        return object : RewardedAdLoadCallback() {\n            override fun onAdLoaded(ad: RewardedAd) {\n            override fun onAdFailedToLoad(adError: LoadAdError) {',
    [android + 'interstitial/AdInterstitialExecutor.java']: '    public static String lastPreparedAdId;',
    [android + 'rewarded/AdRewardExecutor.java']: '    public static String lastPreparedAdId;',
    [android + 'banner/BannerExecutor.java']: '    private AdView mAdView;',
    [android + 'appopen/AppOpenAdPlugin.kt']: '    private val preparedManagers = LinkedHashMap<String, AppOpenAdManager>()\n        val appContext = context.applicationContext\n        runOnMain(activity) {\n            val manager = x\n                onLoaded = {\n                onFailed = { loadAdError ->',
    [android + 'AdMob.java']: '    @PluginMethod\n    public void requestConsentInfo(',
  };
  try {
    for (const [path, source] of Object.entries(fixtures)) {
      mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), source);
    }
    const script = resolve('scripts/patch-admob-privacy-cache.js');
    execFileSync(process.execPath, [script], { cwd });
    const first = Object.keys(fixtures).map(path => readFileSync(resolve(root, path), 'utf8'));
    execFileSync(process.execPath, [script], { cwd });
    expect(Object.keys(fixtures).map(path => readFileSync(resolve(root, path), 'utf8'))).toEqual(first);
    expect(first[0]).toContain('guard generation == self.privacyGeneration');
    expect(first[5]).toContain('generation != AdInterstitialExecutor.privacyGeneration');
    expect(first[4]).toContain('CAPPluginMethod(name: "discardPrivacyCaches"');
    expect(first[11]).toContain('result.put("privacyCacheVersion", 1)');
    for (const source of first) {
      expect(source).not.toContain('resetConsentInfo');
      expect(source).not.toContain('requestTrackingAuthorization');
    }
    // A partially present but broken bridge must fail release preparation.
    writeFileSync(resolve(root, ios + 'AdMobPlugin.swift'), first[4].replace('"privacyCacheVersion": 1', '"privacyCacheVersion": 0'));
    expect(() => execFileSync(process.execPath, [script, 'ios'], { cwd, stdio: 'pipe' })).toThrow();
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});