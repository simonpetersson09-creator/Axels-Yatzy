/** Coalesce interstitial/rewarded SDK loads. No show/reward or frequency changes. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('node_modules/@capacitor-community/admob');
const platform = process.argv[2];
const mark = 'MRB_FULLSCREEN_LOAD_OWNER';
async function patch(path, transform, needles) {
  const file = resolve(root, path);
  let source = await readFile(file, 'utf8');
  if (!source.includes(mark)) {
    const replace = (anchor, value) => {
      if (!source.includes(anchor)) throw new Error(`Fullscreen load anchor missing: ${path}: ${anchor}`);
      source = source.replace(anchor, value);
    };
    transform(replace, () => source, value => { source = value; });
  }
  for (const needle of [mark, ...needles]) {
    if (!source.includes(needle)) throw new Error(`Fullscreen load verification failed: ${path}: ${needle}`);
  }
  await writeFile(file, source);
}

if (!platform || platform === 'ios') {
  for (const [folder, file, method, adType] of [
    ['Interstitial', 'AdInterstitialExecutor.swift', 'prepareInterstitial', 'InterstitialAd'],
    ['Rewarded', 'AdRewardExecutor.swift', 'prepareRewardVideoAd', 'RewardedAd'],
  ]) {
    await patch(`ios/Sources/AdMobPlugin/${folder}/${file}`, (replace, get, set) => {
      replace('    private var privacyGeneration = 0', `    // ${mark}: callbacks own their slot until a real SDK result.
    private final class PendingLoad {
        var calls: [CAPPluginCall]
        init(_ call: CAPPluginCall) { calls = [call] }
    }
    private var pendingLoads: [String: PendingLoad] = [:]
    private var privacyGeneration = 0`);
      replace('        privacyGeneration += 1', '        privacyGeneration += 1\n        pendingLoads.removeAll() // detach, never cancel SDK operations');
      const signature = `    func ${method}(_ call: CAPPluginCall, _ request: Request, _ adUnitID: String) {`;
      replace(signature + '\n        let generation = privacyGeneration', signature + `
        let generation = Thread.isMainThread ? privacyGeneration : DispatchQueue.main.sync { self.privacyGeneration }
        DispatchQueue.main.async {
        guard generation == self.privacyGeneration else { call.reject("Ad invalidated by privacy change"); return }
        if let pending = self.pendingLoads[adUnitID] {
            pending.calls.append(call)
            return
        }
        let owner = PendingLoad(call)
        self.pendingLoads[adUnitID] = owner
        let finish: (String?, String?) -> Void = { message, code in
            if self.pendingLoads[adUnitID] === owner { self.pendingLoads.removeValue(forKey: adUnitID) }
            let calls = owner.calls
            owner.calls.removeAll()
            for waiting in calls {
                if let message = message { waiting.reject(message, code) }
                else { waiting.resolve(["adUnitId": adUnitID]) }
            }
        }`);
      replace('                guard generation == self.privacyGeneration else {\n                    call.reject("Ad invalidated by privacy change")', `                DispatchQueue.main.async {
                guard generation == self.privacyGeneration && self.pendingLoads[adUnitID] === owner else {
                    finish("Ad invalidated by privacy change", nil)`);
      // Only the prepare method is transformed; show/reward callbacks stay byte-identical.
      const source = get();
      const start = source.indexOf(signature);
      const end = source.indexOf(folder === 'Rewarded' ? '    // LOVABLE_ATTEMPT_PATCH' : '    func showInterstitial(', start);
      if (end < 0) throw new Error('Fullscreen prepare boundary missing');
      let prepare = source.slice(start, end);
      prepare = prepare.replace('call.reject(error.localizedDescription, String((error as NSError).code), error)', 'finish(error.localizedDescription, String((error as NSError).code))');
      prepare = prepare.replace('call.reject("Loading failed")', 'finish("Loading failed", nil)');
      if (adType === 'InterstitialAd') prepare = prepare.replace('                if let ad = ad {', '                guard let ad = ad else { finish("Loading failed", nil); return }\n                do {');
      prepare = prepare.replace('                call.resolve([\n                    "adUnitId": adUnitID\n                ])', '                finish(nil, nil)');
      prepare = prepare.replace('            }\n        )\n    }', '                }\n            }\n        )\n        }\n    }');
      set(source.slice(0, start) + prepare + source.slice(end));
    }, ['self.pendingLoads[adUnitID] === owner', 'pending.calls.append(call)', 'finish(nil, nil)', 'pendingLoads.removeAll()']);
  }
}

if (!platform || platform === 'android') {
  for (const [folder, executor, adType, callback] of [
    ['interstitial', 'AdInterstitialExecutor', 'InterstitialAd', 'adCallbackAndListeners.getInterstitialAdLoadCallback(call, notifyListenersFunction)'],
    ['rewarded', 'AdRewardExecutor', 'RewardedAd', 'RewardedAdCallbackAndListeners.INSTANCE.getRewardedAdLoadCallback(call, notifyListenersFunction, adOptions)'],
  ]) {
    await patch(`android/src/main/java/com/getcapacitor/community/admob/${folder}/${executor}.java`, replace => {
      replace('    public static int privacyGeneration = 0;', `    public static volatile int privacyGeneration = 0;
    // ${mark}: UI-thread slots; wait timeouts do not cancel SDK work.
    private static final class PendingLoad {
        final java.util.List<PluginCall> calls = new java.util.ArrayList<>();
        PendingLoad(PluginCall call) { calls.add(call); }
    }
    private static final Map<String, PendingLoad> pendingLoads = new LinkedHashMap<>();
    private static void failLoad(String id, PendingLoad owner, String message) {
        if (pendingLoads.get(id) == owner) pendingLoads.remove(id);
        for (PluginCall waiting : owner.calls) waiting.reject(message);
        owner.calls.clear();
    }`);
      replace('        privacyGeneration++;', '        privacyGeneration++;\n        pendingLoads.clear(); // detach old owners; no SDK cancellation');
      const options = folder === 'interstitial'
        ? '        final AdOptions adOptions = factory.createInterstitialOptions(call);'
        : '        final AdOptions adOptions = AdOptions.getFactory().createRewardVideoOptions(call);';
      replace(options, options + '\n        final int generation = privacyGeneration;');
      replace('                final AdRequest adRequest = RequestHelper.createRequest(adOptions);', '                if (generation != privacyGeneration) { call.reject("Ad invalidated by privacy change"); return; }\n                final AdRequest adRequest = RequestHelper.createRequest(adOptions);');
      replace(`                ${adType}.load(`, `                PendingLoad pending = pendingLoads.get(id);
                if (pending != null) { pending.calls.add(call); return; }
                final PendingLoad owner = new PendingLoad(call);
                pendingLoads.put(id, owner);
                final com.google.android.gms.ads.${folder}.${adType}LoadCallback delegate = ${callback};
                try {
                ${adType}.load(`);
      replace(`                    ${callback}\n                );`, `                    new com.google.android.gms.ads.${folder}.${adType}LoadCallback() {
                        @Override public void onAdLoaded(${adType} ad) {
                            if (generation != privacyGeneration || pendingLoads.get(id) != owner) {
                                failLoad(id, owner, "Ad invalidated by privacy change"); return;
                            }
                            pendingLoads.remove(id);
                            delegate.onAdLoaded(ad); // existing cache/revenue setup and primary call
                            JSObject result = new JSObject(); result.put("adUnitId", ad.getAdUnitId());
                            for (PluginCall waiting : owner.calls) if (waiting != call) waiting.resolve(result);
                            owner.calls.clear();
                        }
                        @Override public void onAdFailedToLoad(com.google.android.gms.ads.LoadAdError error) {
                            if (generation != privacyGeneration || pendingLoads.get(id) != owner) {
                                failLoad(id, owner, "Ad invalidated by privacy change"); return;
                            }
                            pendingLoads.remove(id);
                            delegate.onAdFailedToLoad(error);
                            for (PluginCall waiting : owner.calls) if (waiting != call) waiting.reject(error.getMessage(), String.valueOf(error.getCode()));
                            owner.calls.clear();
                        }
                    }
                );
                } catch (Exception error) { failLoad(id, owner, error.getLocalizedMessage()); }`);
    }, ['pendingLoads.get(id) != owner', 'pending.calls.add(call)', 'final int generation = privacyGeneration', 'pendingLoads.clear()']);
  }
}
console.log('Verified fullscreen SDK load ownership; show/reward methods unchanged');