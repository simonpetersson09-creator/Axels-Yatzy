/** Read-only iOS App Open telemetry. Never refresh/reset consent or gate SDK calls. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin');
async function patch(file, edit) {
  const path = resolve(root, file);
  const before = await readFile(path, 'utf8');
  if (before.includes('MRB_APP_OPEN_DIAGNOSTICS')) {
    if (file === 'AdMobPlugin.swift') {
      const repaired = before.replace('    private var diagnosticHistory: [[String: Any]] = []', '    private let diagnosticLock = NSLock()\n    private var diagnosticHistory: [[String: Any]] = []')
        .replace('        diagnosticHistory.append(row)', '        diagnosticLock.lock()\n        diagnosticHistory.append(row)')
        .replace('        notifyListeners("appOpenDiagnostic", data: row, retainUntilConsumed: true)', '        diagnosticLock.unlock()\n        notifyListeners("appOpenDiagnostic", data: row, retainUntilConsumed: true)')
        .replace('            for var row in self.diagnosticHistory {', '            self.diagnosticLock.lock()\n            let history = self.diagnosticHistory\n            self.diagnosticLock.unlock()\n            for var row in history {');
      if (!before.includes('diagnosticLock')) await writeFile(path, repaired);
    }
    return;
  }
  const replace = (text, anchor, value) => {
    if (!text.includes(anchor)) throw new Error(`Diagnostics anchor missing: ${file}: ${anchor}`);
    return text.replace(anchor, value);
  };
  await writeFile(path, edit(before, replace));
}
await patch('AdMobPlugin.swift', (s, r) => {
  s = r(s, '        CAPPluginMethod(name: "initialize",', '        CAPPluginMethod(name: "noteAppOpenDiagnostic", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "initialize",');
  s = r(s, '    private let appOpenAdPlugin = AppOpenAdPlugin()', `    // MRB_APP_OPEN_DIAGNOSTICS: bounded, process-local technical history only.
    private let diagnosticLock = NSLock()
    private var diagnosticHistory: [[String: Any]] = []
    private var diagnosticFlowId = UUID().uuidString
    func recordAppOpenDiagnostic(_ stage: String) {
        let row = appOpenDiagnosticSnapshot(stage)
        diagnosticLock.lock()
        diagnosticHistory.append(row)
        if diagnosticHistory.count > 24 { diagnosticHistory.removeFirst() }
        diagnosticLock.unlock()
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
            self.diagnosticLock.lock()
            let history = self.diagnosticHistory
            self.diagnosticLock.unlock()
            for var row in history {
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
// Upgrade V1 installations as well as freshly patched sources. Observations only:
// no cancellation, manager ownership or privacy-generation changes.
async function upgrade(file, transform) {
  const path = resolve(root, file);
  const before = await readFile(path, 'utf8');
  if (before.includes('MRB_APP_OPEN_DIAGNOSTICS_V2')) return;
  const replace = (text, anchor, value) => {
    if (!text.includes(anchor)) throw new Error(`Diagnostics V2 anchor missing: ${file}: ${anchor}`);
    return text.replace(anchor, value);
  };
  const after = transform(before, replace);
  await writeFile(path, '// MRB_APP_OPEN_DIAGNOSTICS_V2\n' + after);
}
await upgrade('AdMobPlugin.swift', (s, r) => {
  s = r(s, '            diagnostic: { [weak self] stage in', '            diagnostic: { [weak self] stage, details in');
  s = r(s, '                row["test_mode"] = call.getBool("diagnosticTestMode") ?? false', `                row["test_mode"] = call.getBool("diagnosticTestMode") ?? false
                row["source"] = call.getString("diagnosticSource") ?? "preload"
                for key in ["reason", "error_code", "error_domain", "cache_age_ms"] {
                    if let value = details[key] { row[key] = value }
                }`);
  s = r(s, '                       "att_finished", "init_timeout"]', '                       "att_finished", "init_timeout", "load_reused_pending", "preload_reused_pending", "retry_paused"]');
  s = r(s, '            DispatchQueue.main.async { self.recordAppOpenDiagnostic(stage); call.resolve() }', `            DispatchQueue.main.async {
                if ["load_reused_pending", "preload_reused_pending", "retry_paused"].contains(stage) {
                    var row = self.appOpenDiagnosticSnapshot(stage)
                    if let id = call.getString("attempt_id") { row["attempt_id"] = id }
                    if let source = call.getString("source") { row["source"] = source }
                    if let remaining = call.getDouble("retry_remaining_ms") { row["retry_remaining_ms"] = remaining }
                    self.notifyListeners("appOpenDiagnostic", data: row, retainUntilConsumed: true)
                } else { self.recordAppOpenDiagnostic(stage) }
                call.resolve()
            }`);
  return s;
});
await upgrade('AppOpen/AppOpenAdPlugin.swift', (s, r) => {
  s = r(s, 'diagnostic: @escaping (String) -> Void', 'diagnostic: @escaping (String, [String: Any]) -> Void');
  s = r(s, '        preparedManagers.removeAll()', '        for manager in preparedManagers.values { manager.notePrivacyDiscard() }\n        preparedManagers.removeAll()');
  s = r(s, '                call.reject(message)\n            }, onPaidEvent:', `                let nsError = error as NSError?
                let domain = nsError?.domain == "com.google.admob" ? "com.google.admob" : "other"
                var details: [String: Any] = ["error_domain": domain]
                if let code = nsError?.code { details["error_code"] = code }
                call.reject(message, nil, nil, details)
            }, onPaidEvent:`);
  return s;
});
await upgrade('AppOpen/AppOpenAdManager.swift', (s, r) => {
  s = r(s, 'public func loadAd(diagnostic: @escaping (String) -> Void,', 'public func loadAd(diagnostic diagnosticEvent: @escaping (String, [String: Any]) -> Void,');
  s = r(s, '        discardExpiredAd()\n        if appOpenAd != nil {', '        let diagnostic: (String) -> Void = { stage in diagnosticEvent(stage, [:]) }\n        discardExpiredAd()\n        if appOpenAd != nil {');
  s = r(s, '            diagnostic("cache_reused")', '            noteCachedAd("cache_reused")');
  s = r(s, '        isLoadingAd = true', '        lifecycleDiagnostic = diagnosticEvent\n        isLoadingAd = true');
  s = r(s, '                    diagnostic("load_succeeded")\n                    self.loadedAt = Date()', '                    self.loadedAt = Date()\n                    diagnostic("load_succeeded")');
  s = r(s, '                    diagnostic("load_failed")', `                    let nsError = error as NSError
                    let domain = nsError.domain == "com.google.admob" ? "com.google.admob" : "other"
                    diagnosticEvent(domain == "com.google.admob" && nsError.code == 1 ? "load_no_fill" : "load_failed",
                                    ["error_domain": domain, "error_code": nsError.code])`);
  s = r(s, '    private var impressionDiagnostic:', `    private var lifecycleDiagnostic: ((String, [String: Any]) -> Void)?
    private func noteCachedAd(_ stage: String, reason: String? = nil) {
        var details: [String: Any] = [:]
        if let loadedAt = loadedAt { details["cache_age_ms"] = Date().timeIntervalSince(loadedAt) * 1000 }
        if let reason = reason { details["reason"] = reason }
        lifecycleDiagnostic?(stage, details)
    }
    func notePrivacyDiscard() { noteCachedAd("cache_discarded", reason: "privacy_change") }
    private var impressionDiagnostic:`);
  s = r(s, '        if age < 0 || age >= maxAdAge {', '        if age < 0 || age >= maxAdAge {\n            noteCachedAd("cache_discarded", reason: age < 0 ? "clock_rollback" : "expired")');
  s = r(s, '        return appOpenAd != nil', '        if appOpenAd != nil { noteCachedAd("cache_reused") }\n        return appOpenAd != nil');
  s = r(s, '        ad.present(from: rootViewController)', '        noteCachedAd("presentation_requested")\n        ad.present(from: rootViewController)');
  s = r(s, '        let onOpened = self.onOpened', '        noteCachedAd("presentation_started")\n        let onOpened = self.onOpened');
  s = r(s, '        appOpenAd = nil\n        loadedAt = nil\n        isShowingAd = false', '        noteCachedAd("cache_discarded", reason: "consumed")\n        appOpenAd = nil\n        loadedAt = nil\n        isShowingAd = false');
  const failed = '    public func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {\n        appOpenAd = nil';
  s = r(s, failed, failed.replace('        appOpenAd = nil', '        noteCachedAd("cache_discarded", reason: "presentation_failed")\n        appOpenAd = nil'));
  return s;
});
console.log('Patched read-only iOS App Open diagnostics V2');
