package com.getcapacitor.community.admob.interstitial;

import android.app.Activity;
import android.content.Context;
import androidx.core.util.Supplier;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.community.admob.helpers.AdViewIdHelper;
import com.getcapacitor.community.admob.helpers.FullscreenPluginCallback;
import com.getcapacitor.community.admob.helpers.RequestHelper;
import com.getcapacitor.community.admob.models.AdMobPluginError;
import com.getcapacitor.community.admob.models.AdOptions;
import com.getcapacitor.community.admob.models.Executor;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.common.util.BiConsumer;
import java.util.LinkedHashMap;
import java.util.Map;

public class AdInterstitialExecutor extends Executor {

    public static final Map<String, InterstitialAd> preparedAds = new LinkedHashMap<>();
    public static String lastPreparedAdId;
    // MRB_PRIVACY_CACHE: changed only on the main thread, like SDK callbacks.
    public static volatile int privacyGeneration = 0;
    // MRB_FULLSCREEN_LOAD_OWNER: UI-thread slots; wait timeouts do not cancel SDK work.
    private static final class PendingLoad {
        final java.util.List<PluginCall> calls = new java.util.ArrayList<>();
        PendingLoad(PluginCall call) { calls.add(call); }
    }
    private static final Map<String, PendingLoad> pendingLoads = new LinkedHashMap<>();
    private static void failLoad(String id, PendingLoad owner, String message) {
        if (pendingLoads.get(id) == owner) pendingLoads.remove(id);
        for (PluginCall waiting : owner.calls) waiting.reject(message);
        owner.calls.clear();
    }
    public void discardPrivacyCache() {
        privacyGeneration++;
        pendingLoads.clear(); // detach old owners; no SDK cancellation
        preparedAds.clear();
        lastPreparedAdId = null;
    }

    InterstitialAdCallbackAndListeners adCallbackAndListeners;

    public AdInterstitialExecutor(
        Supplier<Context> contextSupplier,
        Supplier<Activity> activitySupplier,
        BiConsumer<String, JSObject> notifyListenersFunction,
        String pluginLogTag,
        InterstitialAdCallbackAndListeners adCallbackAndListeners
    ) {
        super(contextSupplier, activitySupplier, notifyListenersFunction, pluginLogTag, "AdRewardExecutor");
        this.adCallbackAndListeners = adCallbackAndListeners;
    }

    public void prepareInterstitial(final PluginCall call, BiConsumer<String, JSObject> notifyListenersFunction) {
        final AdOptions.AdOptionsFactory factory = AdOptions.getFactory();
        final AdOptions adOptions = factory.createInterstitialOptions(call);
        final int generation = privacyGeneration;

        try {
            activitySupplier.get().runOnUiThread(() -> {
                if (generation != privacyGeneration) { call.reject("Ad invalidated by privacy change"); return; }
                final AdRequest adRequest = RequestHelper.createRequest(adOptions);
                final String id = AdViewIdHelper.getFinalAdId(adOptions, adRequest, logTag, contextSupplier.get());
                PendingLoad pending = pendingLoads.get(id);
                if (pending != null) { pending.calls.add(call); return; }
                final PendingLoad owner = new PendingLoad(call);
                pendingLoads.put(id, owner);
                final com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback delegate = adCallbackAndListeners.getInterstitialAdLoadCallback(call, notifyListenersFunction);
                try {
                InterstitialAd.load(
                    activitySupplier.get(),
                    id,
                    adRequest,
                    new com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback() {
                        @Override public void onAdLoaded(InterstitialAd ad) {
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
                } catch (Exception error) { failLoad(id, owner, error.getLocalizedMessage()); }
            });
        } catch (Exception ex) {
            call.reject(ex.getLocalizedMessage(), ex);
        }
    }



    public void showInterstitial(final PluginCall call, BiConsumer<String, JSObject> notifyListenersFunction) {
        String requestedAdId = call.getString("adId");
        String adId = requestedAdId != null ? requestedAdId : lastPreparedAdId;
        InterstitialAd ad = adId != null ? preparedAds.get(adId) : null;

        if (ad == null) {
            String errorMessage = "No Interstitial can be shown. It was not prepared or maybe it failed to be prepared.";
            call.reject(errorMessage);
            AdMobPluginError errorObject = new AdMobPluginError(-1, errorMessage);
            notifyListenersFunction.accept(InterstitialAdPluginPluginEvent.FailedToLoad, errorObject);
            return;
        }

        final InterstitialAd adToShow = ad;
        activitySupplier.get().runOnUiThread(() -> {
            try {
                adToShow.setFullScreenContentCallback(
                    new FullscreenPluginCallback(InterstitialAdPluginPluginEvent.INSTANCE, notifyListenersFunction, () -> {
                        preparedAds.remove(adId);
                        if (adId != null && adId.equals(lastPreparedAdId)) {
                            lastPreparedAdId = null;
                            for (String remainingAdId : preparedAds.keySet()) lastPreparedAdId = remainingAdId;
                        }
                    })
                );
                adToShow.show(activitySupplier.get());
                call.resolve();
            } catch (Exception ex) {
                call.reject(ex.getLocalizedMessage(), ex);
            }
        });
    }
}
