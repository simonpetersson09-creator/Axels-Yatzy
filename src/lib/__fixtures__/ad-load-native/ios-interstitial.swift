import Foundation
import Capacitor
import GoogleMobileAds

class AdInterstitialExecutor: NSObject, FullScreenContentDelegate {
    weak var plugin: AdMobPlugin?
    // MRB_PRIVACY_CACHE
    // MRB_FULLSCREEN_LOAD_OWNER: callbacks own their slot until a real SDK result.
    private final class PendingLoad {
        var calls: [CAPPluginCall]
        init(_ call: CAPPluginCall) { calls = [call] }
    }
    private var pendingLoads: [String: PendingLoad] = [:]
    private var privacyGeneration = 0
    func discardPrivacyCache() {
        privacyGeneration += 1
        pendingLoads.removeAll() // detach, never cancel SDK operations
        preparedAds.removeAll()
        lastPreparedAdId = nil
    }
    private var preparedAds: [String: InterstitialAd] = [:]
    private var lastPreparedAdId: String?
    private var currentlyShowingAdId: String?



    func prepareInterstitial(_ call: CAPPluginCall, _ request: Request, _ adUnitID: String) {
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
        }
        InterstitialAd.load(
            with: adUnitID,
            request: request,
            completionHandler: { (ad, error) in
                DispatchQueue.main.async {
                guard generation == self.privacyGeneration && self.pendingLoads[adUnitID] === owner else {
                    finish("Ad invalidated by privacy change", nil)
                    return
                }
                if let error = error {
                    NSLog("Interstitial ad failed to load with error: \(error.localizedDescription)")
                    self.plugin?.notifyListeners(InterstitialAdPluginEvents.FailedToLoad.rawValue, data: [
                        "code": (error as NSError).code,
                        "message": error.localizedDescription
                    ])
                    finish(error.localizedDescription, String((error as NSError).code))
                    return
                }

                guard let ad = ad else { finish("Loading failed", nil); return }
                do {
                    ad.fullScreenContentDelegate = self
                    ad.paidEventHandler = { adValue in
                        let networkName = ad.responseInfo.loadedAdNetworkResponseInfo?.adNetworkClassName ?? ""
                        let impressionId = ad.responseInfo.responseIdentifier ?? ""
                        self.plugin?.notifyListeners(InterstitialAdPluginEvents.AdImpression.rawValue, data: [
                            "adUnitId": adUnitID,
                            "valueMicros": adValue.value.multiplying(byPowerOf10: 6).int64Value,
                            "currencyCode": adValue.currencyCode,
                            "precision": adValue.precision.rawValue,
                            "networkName": networkName,
                            "impressionId": impressionId
                        ])
                    }
                    self.preparedAds[adUnitID] = ad
                    self.lastPreparedAdId = adUnitID
                }
                self.plugin?.notifyListeners(InterstitialAdPluginEvents.Loaded.rawValue, data: [
                    "adUnitId": adUnitID
                ])
                finish(nil, nil)
                }
            }
        )
        }
    }

    func showInterstitial(_ call: CAPPluginCall) {
        guard let adId = call.getString("adId") ?? lastPreparedAdId else {
            call.reject("No ad prepared")
            return
        }
        guard currentlyShowingAdId == nil else {
            call.reject("An ad is already showing")
            return
        }

        if let rootViewController = plugin?.getRootVC() {
            if let ad = preparedAds[adId] {
                currentlyShowingAdId = adId
                ad.present(from: rootViewController)
                call.resolve([:])
            } else {
                NSLog("Ad wasn't ready")
                call.reject("Ad wasn't ready")
            }
        }
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        self.plugin?.resumeWebMedia(for: ad)
        removeCurrentlyShowingAd()
        NSLog("InterstitialFullScreenDelegate Ad failed to present full screen content with error \(error.localizedDescription).")
        self.plugin?.notifyListeners(InterstitialAdPluginEvents.FailedToShow.rawValue, data: [
            "code": 0,
            "message": error.localizedDescription
        ])
    }

    func adWillPresentFullScreenContent(_ ad: FullScreenPresentingAd) {
        self.plugin?.suspendWebMedia(for: ad)
        NSLog("InterstitialFullScreenDelegate Ad did present full screen content.")
        self.plugin?.notifyListeners(InterstitialAdPluginEvents.Showed.rawValue, data: [:])
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        self.plugin?.resumeWebMedia(for: ad)
        removeCurrentlyShowingAd()
        NSLog("InterstitialFullScreenDelegate Ad did dismiss full screen content.")
        self.plugin?.notifyListeners(InterstitialAdPluginEvents.Dismissed.rawValue, data: [:])
    }

    private func removeCurrentlyShowingAd() {
        guard let adId = currentlyShowingAdId else { return }
        preparedAds.removeValue(forKey: adId)
        if lastPreparedAdId == adId { lastPreparedAdId = Array(preparedAds.keys).last }
        currentlyShowingAdId = nil
    }
}
