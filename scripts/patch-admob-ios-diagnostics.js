/** Read-only iOS App Open telemetry. Never refresh/reset consent or gate SDK calls. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin');
async function patch(file, edit) {
  const path = resolve(root, file);
  const before = await readFile(path, 'utf8');
  if (before.includes('MRB_APP_OPEN_DIAGNOSTICS')) return;
  const replace = (text, anchor, value) => {
    if (!text.includes(anchor)) throw new Error(`Diagnostics anchor missing: ${file}: ${anchor}`);
    return text.replace(anchor, value);
  };
  await writeFile(path, edit(before, replace));
}
await patch('AdMobPlugin.swift', (s, r) => {
  s = r(s, '        CAPPluginMethod(name: "initialize",', '        CAPPluginMethod(name: "noteAppOpenDiagnostic", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "initialize",');
  s = r(s, '    private let appOpenAdPlugin = AppOpenAdPlugin()', `    // MRB_APP_OPEN_DIAGNOSTICS: bounded, process-local technical history only.
    private var diagnosticHistory: [[String: Any]] = []
    private var diagnosticFlowId = UUID().uuidString
    func recordAppOpenDiagnostic(_ stage: String) {
        let row = appOpenDiagnosticSnapshot(stage)
        diagnosticHistory.append(row)
        if diagnosticHistory.count > 24 { diagnosticHistory.removeFirst() }
        notifyListeners("appOpenDiagnostic", data: row, retainUntilConsumed: true)
    }
    func appOpenDiagnosticSnapshot(_ stage: String) -> [String: Any] {
        var att = "unavailable"
        if #available(iOS 14, *) {
            #if canImport(AppTrackingTransparency)
            switch ATTrackingManager.trackingAuthorizationStatus {
            case .authorized: att = "authorized"
            case .denied: att = "denied"
            case .restricted: att = "restricted"
            case .notDetermined: att = "notDetermined"
            @unknown default: att = "unknown"
            }
            #endif
        }
        let ump: String
        switch ConsentInformation.shared.consentStatus {
        case .required: ump = "REQUIRED"
        case .notRequired: ump = "NOT_REQUIRED"
        case .obtained: ump = "OBTAINED"
        default: ump = "UNKNOWN"
        }
        return ["stage": stage, "flow_id": diagnosticFlowId,
                "attempt_id": diagnosticFlowId, "occurred_at_ms": Date().timeIntervalSince1970 * 1000,
                "att_status": att, "ump_status": ump,
                "can_request_ads": ConsentInformation.shared.canRequestAds,
                "app_version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
                "build_number": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"]
    }
    @objc func noteAppOpenDiagnostic(_ call: CAPPluginCall) {
        let allowed = ["consent_finished", "consent_info_timeout", "consent_form_timeout",
                       "consent_eligibility_timeout", "consent_failed", "consent_eligibility_failed",
                       "att_status_timeout", "att_status_failed", "att_request_timeout", "att_request_failed",
                       "att_finished", "init_timeout"]
        if let stage = call.getString("stage"), allowed.contains(stage) {
            DispatchQueue.main.async { self.recordAppOpenDiagnostic(stage); call.resolve() }
        } else { call.resolve() }
    }
    private let appOpenAdPlugin = AppOpenAdPlugin()`);
  s = r(s, '        appOpenAdPlugin.loadAppOpen(\n', `        let attemptId = call.getString("diagnosticAttemptId") ?? UUID().uuidString
        DispatchQueue.main.async {
            for var row in self.diagnosticHistory {
                row["attempt_id"] = attemptId
                row["replayed"] = true
                self.notifyListeners("appOpenDiagnostic", data: row, retainUntilConsumed: true)
            }
        }
        appOpenAdPlugin.loadAppOpen(
`);
  s = r(s, '            notify: { [weak self] eventName, data in', `            diagnostic: { [weak self] stage in
                guard let self = self else { return }
                var row = self.appOpenDiagnosticSnapshot(stage)
                row["attempt_id"] = attemptId
                row["ad_unit_id"] = call.getString("adId") ?? "unknown"
                row["test_mode"] = call.getBool("diagnosticTestMode") ?? false
                self.notifyListeners("appOpenDiagnostic", data: row, retainUntilConsumed: true)
            },
            notify: { [weak self] eventName, data in`);
  s = r(s, '            self.consentExecutor.requestConsentInfo(call,', '            self.recordAppOpenDiagnostic("consent_before")\n            self.consentExecutor.requestConsentInfo(call,');
  s = r(s, '                call.resolve([:])\n            })', '                DispatchQueue.main.async { self.recordAppOpenDiagnostic("att_answer") }\n                call.resolve([:])\n            })');
  return s;
});
await patch('Consent/ConsentExecutor.swift', (s, r) => {
  s = '// MRB_APP_OPEN_DIAGNOSTICS\n' + s;
  s = r(s, '                if error != nil {', '                self.plugin?.recordAppOpenDiagnostic(error == nil ? "consent_info_returned" : "consent_info_failed")\n                if error != nil {');
  s = r(s, '                        call.resolve([', '                        self.plugin?.recordAppOpenDiagnostic("consent_form_returned")\n                        call.resolve([');
  s = r(s, '                        call.reject("Request consent info failed")', '                        self.plugin?.recordAppOpenDiagnostic("consent_form_failed")\n                        call.reject("Request consent info failed")');
  return s;
});
await patch('AppOpen/AppOpenAdPlugin.swift', (s, r) => {
  s = '// MRB_APP_OPEN_DIAGNOSTICS\n' + s;
  s = r(s, '        notify: @escaping (String, [String: Any]) -> Void', '        diagnostic: @escaping (String) -> Void,\n        notify: @escaping (String, [String: Any]) -> Void');
  s = r(s, '            self.preparedManagers[adUnitId]?.loadAd(onLoaded:', '            self.preparedManagers[adUnitId]?.loadAd(diagnostic: diagnostic, onLoaded:');
  return s;
});
await patch('AppOpen/AppOpenAdManager.swift', (s, r) => {
  s = '// MRB_APP_OPEN_DIAGNOSTICS\n' + s;
  s = r(s, '    public func loadAd(onLoaded:', '    public func loadAd(diagnostic: @escaping (String) -> Void, onLoaded:');
  s = r(s, '        if appOpenAd != nil {\n            onLoaded()', '        if appOpenAd != nil {\n            diagnostic("cache_reused")\n            onLoaded()');
  s = r(s, '                let ad = try await AppOpenAd.load', '                diagnostic("load_requested")\n                let ad = try await AppOpenAd.load');
  s = r(s, '                    self.appOpenAd = ad', '                    self.appOpenAd = ad\n                    self.impressionDiagnostic = diagnostic\n                    diagnostic("load_succeeded")');
  s = r(s, '                    onFailed(error)', '                    diagnostic("load_failed")\n                    onFailed(error)');
  s = r(s, '    private var onClosed:', '    private var impressionDiagnostic: ((String) -> Void)?\n    private var onClosed:');
  s = r(s, 'extension AppOpenAdManager: FullScreenContentDelegate {', `extension AppOpenAdManager: FullScreenContentDelegate {
    public func adDidRecordImpression(_ ad: FullScreenPresentingAd) {
        impressionDiagnostic?("impression")
        impressionDiagnostic = nil
    }
`);
  return s;
});
console.log('Patched read-only iOS App Open diagnostics');
