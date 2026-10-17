/**
 * Patch @capacitor-community/admob (8.1.x) rewarded ads so every show attempt
 * is identifiable and always ends with a definite answer.
 *
 * Contract after the patch (iOS + Android), for showRewardVideoAd({ attemptId }):
 *  - Showed / Rewarded / Dismissed / FailedToShow events carry `attemptId`.
 *  - The call resolves exactly once when the ad is dismissed:
 *      { attemptId, rewarded: boolean, patched: true }
 *    and rejects when the ad cannot be presented (no ad, no view controller /
 *    activity, already showing, presentation error).
 *  - A second show while one is on screen is rejected natively.
 *  - The shown ad object is dropped on dismiss/fail, so it cannot be reused.
 * The Rewarded event can still arrive after dismissal; it carries the id, so
 * the app pays it to the right attempt (no time window needed).
 *
 * The plugin compiles from node_modules on both platforms, so patching here
 * survives the regenerated ios/ and android/ folders. Idempotent.
 */
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), 'node_modules/@capacitor-community/admob');
const MARK = 'LOVABLE_ATTEMPT_PATCH';
const platform = process.argv[2]; // 'ios' | 'android' | undefined (both)

const IOS_FILE = resolve(ROOT, 'ios/Sources/AdMobPlugin/Rewarded/AdRewardExecutor.swift');
const ANDROID_FILE = resolve(ROOT, 'android/src/main/java/com/getcapacitor/community/admob/rewarded/AdRewardExecutor.java');

const IOS_TAIL = `    // ${MARK}
    private var currentCall: CAPPluginCall?
    private var currentAttemptId: String = ""
    private var currentRewarded = false

    func showRewardVideoAd(_ call: CAPPluginCall) {
        let attemptId = call.getString("attemptId") ?? ""
        guard let adId = call.getString("adId") ?? lastPreparedAdId else {
            call.reject("No ad prepared")
            return
        }
        guard currentlyShowingAdId == nil else {
            call.reject("An ad is already showing")
            return
        }
        guard let rootViewController = plugin?.getRootVC() else {
            call.reject("No view controller to present from")
            return
        }
        guard let ad = preparedAds[adId] else {
            call.reject("Reward Video is Not Ready Yet")
            return
        }
        currentlyShowingAdId = adId
        currentCall = call
        currentAttemptId = attemptId
        currentRewarded = false
        ad.present(from: rootViewController, userDidEarnRewardHandler: {
            let reward = ad.adReward
            self.currentRewarded = true
            self.plugin?.notifyListeners(RewardAdPluginEvents.Rewarded.rawValue, data: [
                "type": reward.type, "amount": reward.amount, "attemptId": attemptId
            ])
        })
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        let attemptId = currentAttemptId
        let call = currentCall
        removeCurrentlyShowingAd()
        self.plugin?.notifyListeners(RewardAdPluginEvents.FailedToShow.rawValue, data: [
            "code": 0, "message": error.localizedDescription, "attemptId": attemptId
        ])
        call?.reject("Failed to present: \\(error.localizedDescription)")
    }

    func adWillPresentFullScreenContent(_ ad: FullScreenPresentingAd) {
        self.plugin?.notifyListeners(RewardAdPluginEvents.Showed.rawValue, data: ["attemptId": currentAttemptId])
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        let attemptId = currentAttemptId
        let rewarded = currentRewarded
        let call = currentCall
        removeCurrentlyShowingAd()
        self.plugin?.notifyListeners(RewardAdPluginEvents.Dismissed.rawValue, data: ["attemptId": attemptId])
        call?.resolve(["attemptId": attemptId, "rewarded": rewarded, "patched": true])
    }

    private func removeCurrentlyShowingAd() {
        currentCall = nil
        currentRewarded = false
        guard let adId = currentlyShowingAdId else { return }
        preparedAds.removeValue(forKey: adId)
        if lastPreparedAdId == adId { lastPreparedAdId = Array(preparedAds.keys).last }
        currentlyShowingAdId = nil
    }
}
`;

const ANDROID_SHOW = `    // ${MARK}
    private static boolean showing = false;

    @PluginMethod
    public void showRewardVideoAd(final PluginCall call, BiConsumer<String, JSObject> notifyListenersFunction) {
        final String attemptId = call.getString("attemptId", "");
        String requestedAdId = call.getString("adId");
        final String adId = requestedAdId != null ? requestedAdId : lastPreparedAdId;
        final RewardedAd ad = adId != null ? preparedAds.get(adId) : null;
        final Activity activity = activitySupplier.get();

        if (ad == null) { call.reject("No Reward Video Ad can be shown. It was not prepared."); return; }
        if (activity == null) { call.reject("No activity to present from"); return; }
        if (showing) { call.reject("An ad is already showing"); return; }
        showing = true;

        final boolean[] rewarded = { false };
        final Runnable dropAd = () -> {
            showing = false;
            preparedAds.remove(adId);
            if (adId.equals(lastPreparedAdId)) {
                lastPreparedAdId = null;
                for (String remainingAdId : preparedAds.keySet()) lastPreparedAdId = remainingAdId;
            }
        };
        try {
            activity.runOnUiThread(() -> {
                ad.setFullScreenContentCallback(new com.google.android.gms.ads.FullScreenContentCallback() {
                    @Override
                    public void onAdShowedFullScreenContent() {
                        JSObject d = new JSObject(); d.put("attemptId", attemptId);
                        notifyListenersFunction.accept(RewardAdPluginEvents.Showed, d);
                    }
                    @Override
                    public void onAdFailedToShowFullScreenContent(com.google.android.gms.ads.AdError adError) {
                        dropAd.run();
                        JSObject d = new JSObject();
                        d.put("code", adError.getCode()); d.put("message", adError.getMessage()); d.put("attemptId", attemptId);
                        notifyListenersFunction.accept(RewardAdPluginEvents.FailedToShow, d);
                        call.reject("Failed to present: " + adError.getMessage());
                    }
                    @Override
                    public void onAdDismissedFullScreenContent() {
                        dropAd.run();
                        JSObject d = new JSObject(); d.put("attemptId", attemptId);
                        notifyListenersFunction.accept(RewardAdPluginEvents.Dismissed, d);
                        JSObject r = new JSObject();
                        r.put("attemptId", attemptId); r.put("rewarded", rewarded[0]); r.put("patched", true);
                        call.resolve(r);
                    }
                });
                try {
                    ad.show(activity, item -> {
                        rewarded[0] = true;
                        JSObject d = new JSObject();
                        d.put("type", item.getType()); d.put("amount", item.getAmount()); d.put("attemptId", attemptId);
                        notifyListenersFunction.accept(RewardAdPluginEvents.Rewarded, d);
                    });
                } catch (Exception ex) {
                    dropAd.run();
                    call.reject(ex.getLocalizedMessage(), ex);
                }
            });
        } catch (Exception ex) {
            showing = false;
            call.reject(ex.getLocalizedMessage(), ex);
        }
    }
}
`;

async function patch(file, startMarker, tail, label) {
  if (!existsSync(file)) { console.warn(`[admob patch] ${label}: ${file} missing — skipped.`); return; }
  let src = await readFile(file, 'utf-8');
  if (src.includes(MARK)) { console.log(`[admob patch] ${label}: already patched.`); return; }
  const i = src.indexOf(startMarker);
  if (i < 0) { console.error(`[admob patch] ${label}: unexpected plugin source (marker not found).`); process.exit(1); }
  src = src.slice(0, i) + tail;
  await writeFile(file, src, 'utf-8');
  console.log(`[admob patch] ${label}: patched.`);
}

async function main() {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf-8'));
  if (!String(pkg.version).startsWith('8.1.')) {
    console.error(`[admob patch] plugin ${pkg.version} not verified (expected 8.1.x) — update scripts/patch-admob-rewarded.js.`);
    process.exit(1);
  }
  if (platform !== 'android') await patch(IOS_FILE, '    func showRewardVideoAd(', IOS_TAIL, 'iOS');
  if (platform !== 'ios') {
    // Keep everything up to the original show method (prepare stays untouched).
    await patch(ANDROID_FILE, '    @PluginMethod\n    public void showRewardVideoAd(', ANDROID_SHOW, 'Android');
  }
}

main().catch((err) => { console.error('[admob patch] failed:', err); process.exit(1); });
