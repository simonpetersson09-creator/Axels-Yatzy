/** Cache-only privacy boundary. Never resets UMP or interrupts presented ads. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('node_modules/@capacitor-community/admob');
const platform = process.argv[2];
const mark = 'MRB_PRIVACY_CACHE';
async function patch(path, transform, required) {
  const file = resolve(root, path);
  let source = await readFile(file, 'utf8');
  // Repair the additional stale-error guard in an already patched iOS banner.
  if (path.endsWith('Banner/BannerExecutor.swift') && source.includes(mark) && !source.includes('MRB_PRIVACY_BANNER_ERROR')) {
    const anchor = '                    didFailToReceiveAdWithError error: Error) {';
    if (!source.includes(anchor)) throw new Error('Privacy banner error anchor missing');
    source = source.replace(anchor, anchor + '\n        // MRB_PRIVACY_BANNER_ERROR\n        guard bannerView === self.bannerView else { return }');
  }
  if (!source.includes(mark)) {
    const replace = (anchor, value) => {
      if (!source.includes(anchor)) throw new Error(`Privacy cache anchor missing in ${path}: ${anchor}`);
      source = source.replace(anchor, value);
    };
    transform(replace);
  }
  for (const value of required) {
    if (!source.includes(value)) throw new Error(`Privacy cache verification failed in ${path}: ${value}`);
  }
  await writeFile(file, source);
}

if (!platform || platform === 'ios') {
  const base = 'ios/Sources/AdMobPlugin/';
  for (const [file, method] of [
    ['Interstitial/AdInterstitialExecutor.swift', 'prepareInterstitial'],
    ['Rewarded/AdRewardExecutor.swift', 'prepareRewardVideoAd'],
  ]) {
    await patch(base + file, replace => {
      replace('    private var preparedAds:', `    // ${mark}
    private var privacyGeneration = 0
    func discardPrivacyCache() {
        privacyGeneration += 1
        preparedAds.removeAll()
        lastPreparedAdId = nil
    }
    private var preparedAds:`);
      const signature = `    func ${method}(_ call: CAPPluginCall, _ request: Request, _ adUnitID: String) {`;
      replace(signature, signature + '\n        let generation = privacyGeneration');
      replace('completionHandler: { (ad, error) in', `completionHandler: { (ad, error) in
                guard generation == self.privacyGeneration else {
                    call.reject("Ad invalidated by privacy change")
                    return
                }`);
    }, [mark, 'func discardPrivacyCache()', 'guard generation == self.privacyGeneration']);
  }
  await patch(base + 'Banner/BannerExecutor.swift', replace => {
    replace('    func showBanner(', `    // ${mark}
    func discardPrivacyCache() {
        bannerView?.delegate = nil
        bannerView?.paidEventHandler = nil
        removeBannerViewToView()
        bannerView = nil
    }
    func showBanner(`);
    for (const signature of [
      '    func bannerViewDidReceiveAd(_ bannerView: BannerView) {',
      '    func bannerViewDidRecordImpression(_ bannerView: BannerView) {',
    ]) replace(signature, signature + '\n        guard bannerView === self.bannerView else { return }');
    replace('                    didFailToReceiveAdWithError error: Error) {', '                    didFailToReceiveAdWithError error: Error) {\n        // MRB_PRIVACY_BANNER_ERROR\n        guard bannerView === self.bannerView else { return }');
  }, [mark, 'bannerView?.delegate = nil', 'guard bannerView === self.bannerView']);
  await patch(base + 'AppOpen/AppOpenAdPlugin.swift', replace => {
    replace('    private var preparedManagers:', `    // ${mark}
    private var privacyGeneration = 0
    func discardPrivacyCache() {
        privacyGeneration += 1
        preparedManagers.removeAll()
        lastPreparedAdId = nil
    }
    private var preparedManagers:`);
    replace('        DispatchQueue.main.async {', '        let generation = self.privacyGeneration\n        DispatchQueue.main.async {\n            guard generation == self.privacyGeneration else { call.reject("Ad invalidated by privacy change"); return }');
    replace('            self.preparedManagers[adUnitId]?.loadAd(onLoaded: {', `            self.preparedManagers[adUnitId]?.loadAd(onLoaded: {
                guard generation == self.privacyGeneration else { call.reject("Ad invalidated by privacy change"); return }`);
    replace('            }, onFailed: { error in', '            }, onFailed: { error in\n                guard generation == self.privacyGeneration else { call.reject("Ad invalidated by privacy change"); return }');
  }, [mark, 'preparedManagers.removeAll()', 'guard generation == self.privacyGeneration']);
  await patch(base + 'AdMobPlugin.swift', replace => {
    const method = '        CAPPluginMethod(name: "requestConsentInfo", returnType: CAPPluginReturnPromise),';
    replace(method, '        CAPPluginMethod(name: "discardPrivacyCaches", returnType: CAPPluginReturnPromise),\n' + method);
    replace('    @objc func requestConsentInfo(', `    // ${mark}
    @objc func discardPrivacyCaches(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.adInterstitialExecutor.discardPrivacyCache()
            self.adRewardExecutor.discardPrivacyCache()
            self.bannerExecutor.discardPrivacyCache()
            self.appOpenAdPlugin.discardPrivacyCache()
            call.resolve(["privacyCacheVersion": 1])
        }
    }
    @objc func requestConsentInfo(`);
  }, [mark, 'CAPPluginMethod(name: "discardPrivacyCaches"', '"privacyCacheVersion": 1']);
}

if (!platform || platform === 'android') {
  const base = 'android/src/main/java/com/getcapacitor/community/admob/';
  for (const [file, owner, callback] of [
    ['interstitial/InterstitialAdCallbackAndListeners.kt', 'AdInterstitialExecutor', 'getInterstitialAdLoadCallback'],
    ['rewarded/RewardedAdCallbackAndListeners.kt', 'AdRewardExecutor', 'getRewardedAdLoadCallback'],
  ]) {
    await patch(base + file, replace => {
      replace('        return object :', `        // ${mark}
        val generation = ${owner}.privacyGeneration
        return object :`);
      const adType = owner === 'AdInterstitialExecutor' ? 'InterstitialAd' : 'RewardedAd';
      replace(`            override fun onAdLoaded(ad: ${adType}) {`, `            override fun onAdLoaded(ad: ${adType}) {
                if (generation != ${owner}.privacyGeneration) { call.reject("Ad invalidated by privacy change"); return }`);
      replace('            override fun onAdFailedToLoad(adError: LoadAdError) {', `            override fun onAdFailedToLoad(adError: LoadAdError) {
                if (generation != ${owner}.privacyGeneration) { call.reject("Ad invalidated by privacy change"); return }`);
    }, [mark, `${owner}.privacyGeneration`, callback]);
  }
  for (const file of ['interstitial/AdInterstitialExecutor.java', 'rewarded/AdRewardExecutor.java']) {
    await patch(base + file, replace => {
      replace('    public static String lastPreparedAdId;', `    public static String lastPreparedAdId;
    // ${mark}: changed only on the main thread, like SDK callbacks.
    public static int privacyGeneration = 0;
    public void discardPrivacyCache() {
        privacyGeneration++;
        preparedAds.clear();
        lastPreparedAdId = null;
    }`);
    }, [mark, 'privacyGeneration++', 'preparedAds.clear()']);
  }
  await patch(base + 'banner/BannerExecutor.java', replace => {
    replace('    private AdView mAdView;', `    private AdView mAdView;
    // ${mark}
    public void discardPrivacyCache() {
        if (mAdView != null) {
            mAdView.setAdListener(null);
            mAdView.setOnPaidEventListener(null);
            mAdView.destroy();
            mAdView = null;
        }
        if (mAdViewLayout != null && mViewGroup != null) mViewGroup.removeView(mAdViewLayout);
    }`);
  }, [mark, 'mAdView.setAdListener(null)', 'mAdView = null']);
  await patch(base + 'appopen/AppOpenAdPlugin.kt', replace => {
    replace('    private val preparedManagers', `    // ${mark}
    private var privacyGeneration = 0
    fun discardPrivacyCache() {
        privacyGeneration++
        preparedManagers.clear()
        lastPreparedAdId = null
    }
    private val preparedManagers`);
    replace('        val appContext = context.applicationContext', '        val generation = privacyGeneration\n        val appContext = context.applicationContext');
    replace('        runOnMain(activity) {\n            val manager', '        runOnMain(activity) {\n            if (generation != privacyGeneration) { call.reject("Ad invalidated by privacy change"); return@runOnMain }\n            val manager');
    replace('                onLoaded = {', '                onLoaded = {\n                    if (generation != privacyGeneration) { call.reject("Ad invalidated by privacy change"); return@loadAd }');
    replace('                onFailed = { loadAdError ->', '                onFailed = { loadAdError ->\n                    if (generation != privacyGeneration) { call.reject("Ad invalidated by privacy change"); return@loadAd }');
  }, [mark, 'preparedManagers.clear()', 'generation != privacyGeneration']);
  await patch(base + 'AdMob.java', replace => {
    replace('    @PluginMethod\n    public void requestConsentInfo(', `    // ${mark}
    @PluginMethod
    public void discardPrivacyCaches(final PluginCall call) {
        if (getActivity() == null) { call.reject("Activity unavailable"); return; }
        getActivity().runOnUiThread(() -> {
            adInterstitialExecutor.discardPrivacyCache();
            adRewardExecutor.discardPrivacyCache();
            bannerExecutor.discardPrivacyCache();
            appOpenAdPlugin.discardPrivacyCache();
            JSObject result = new JSObject(); result.put("privacyCacheVersion", 1);
            call.resolve(result);
        });
    }
    @PluginMethod
    public void requestConsentInfo(`);
  }, [mark, 'public void discardPrivacyCaches', 'result.put("privacyCacheVersion", 1)']);
}
console.log('Verified privacy cache boundary; no UMP reset or ATT changes');