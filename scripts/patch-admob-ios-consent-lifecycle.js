/** Keep ATT on the active main-thread presenter; never reset consent or cancel SDK UI. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin');
const marker = 'MRB_IOS_CONSENT_LIFECYCLE';
const path = resolve(root, 'AdMobPlugin.swift');
let source = await readFile(path, 'utf8');
if (!source.includes(marker)) {
  const start = source.indexOf('    @objc func requestTrackingAuthorization(_ call: CAPPluginCall) {');
  const end = source.indexOf('    @objc func setApplicationMuted', start);
  if (start < 0 || end < 0) throw new Error('ATT lifecycle method anchors missing');
  source = source.slice(0, start) + `    // ${marker}: owned until the actual ATT callback, including deferred activity.
    private var pendingTrackingCalls: [CAPPluginCall] = []
    private var trackingNativePending = false
    private var trackingDeferralReason: String?

    @objc func requestTrackingAuthorization(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pendingTrackingCalls.append(call)
            if self.pendingTrackingCalls.count == 1 { self.tryPendingTrackingAuthorization() }
        }
    }

    private func finishTrackingAuthorization() {
        let calls = pendingTrackingCalls
        pendingTrackingCalls.removeAll()
        trackingNativePending = false
        trackingDeferralReason = nil
        recordAppOpenDiagnostic("att_answer")
        for call in calls { call.resolve([:]) }
    }

    private func tryPendingTrackingAuthorization() {
        dispatchPrecondition(condition: .onQueue(.main))
        guard !pendingTrackingCalls.isEmpty, !trackingNativePending else { return }
        if #available(iOS 14, *) {
            #if canImport(AppTrackingTransparency)
            guard ATTrackingManager.trackingAuthorizationStatus == .notDetermined else {
                finishTrackingAuthorization()
                return
            }
            let reason: String?
            if UIApplication.shared.applicationState != .active {
                reason = "att_deferred_inactive"
            } else if consentExecutor.consentUIBusy {
                reason = "att_deferred_consent"
            } else if let root = getRootVC(), root.viewIfLoaded?.window != nil,
                      root.presentedViewController == nil, !root.isBeingDismissed {
                reason = nil
            } else {
                reason = "att_deferred_presenter"
            }
            if let reason = reason {
                if trackingDeferralReason != reason { recordAppOpenDiagnostic(reason) }
                trackingDeferralReason = reason
                // One readiness check, not another permission attempt or ad request.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    self.tryPendingTrackingAuthorization()
                }
                return
            }
            trackingNativePending = true
            recordAppOpenDiagnostic("att_before_request")
            ATTrackingManager.requestTrackingAuthorization { _ in
                DispatchQueue.main.async { self.finishTrackingAuthorization() }
            }
            #else
            finishTrackingAuthorization()
            #endif
        } else { finishTrackingAuthorization() }
    }

` + source.slice(end);
  source = source.replace('    func recordAppOpenDiagnostic(_ stage: String) {', `    func recordAppOpenDiagnostic(_ stage: String) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.recordAppOpenDiagnostic(stage) }
            return
        }`);
  source = source.replace('    func appOpenDiagnosticSnapshot(_ stage: String) -> [String: Any] {', `    func appOpenDiagnosticSnapshot(_ stage: String) -> [String: Any] {
        if !Thread.isMainThread {
            return DispatchQueue.main.sync { self.appOpenDiagnosticSnapshot(stage) }
        }`);
  source = source.replace('let allowed = ["consent_finished",', 'let allowed = ["consent_started", "consent_reused_pending", "consent_finished",');
  await writeFile(path, source);
}
const consentPath = resolve(root, 'Consent/ConsentExecutor.swift');
let consent = await readFile(consentPath, 'utf8');
if (!consent.includes(marker)) {
  const replace = (anchor, value) => {
    if (!consent.includes(anchor)) throw new Error(`Consent lifecycle anchor missing: ${anchor}`);
    consent = consent.replace(anchor, value);
  };
  replace('    weak var plugin: AdMobPlugin?', `    // ${marker}: only read/write on the main queue.
    var consentUIBusy = false
    weak var plugin: AdMobPlugin?`);
  replace('            completionHandler: { error in', '            completionHandler: { error in\n                DispatchQueue.main.async {');
  replace('            })', '                }\n            })');
  // A single native gate prevents privacy options crossing an ongoing UMP form/ATT.
  for (const method of ['showPrivacyOptionsForm', 'showConsentForm']) {
    replace(`    func ${method}(_ call: CAPPluginCall) {`, `    func ${method}(_ call: CAPPluginCall) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard !consentUIBusy else { call.reject("Consent UI pending"); return }
        if #available(iOS 14, *) {
            guard plugin?.isTrackingNativePending != true else { call.reject("ATT UI pending"); return }
        }`);
  }
  replace('        Task {\n            do {', '        consentUIBusy = true\n        Task { @MainActor in\n            defer { self.consentUIBusy = false }\n            do {');
  replace('                Task { @MainActor in\n                    do {', '                consentUIBusy = true\n                Task { @MainActor in\n                    defer { self.consentUIBusy = false }\n                    do {');
  await writeFile(consentPath, consent);
}
// Expose only the busy bit, not tracking data, to the UMP presenter.
source = await readFile(path, 'utf8');
if (!source.includes('var isTrackingNativePending: Bool')) {
  source = source.replace('    private var trackingNativePending = false', '    private var trackingNativePending = false\n    var isTrackingNativePending: Bool { trackingNativePending }');
  await writeFile(path, source);
}
for (const needle of ['UIApplication.shared.applicationState != .active', 'consentExecutor.consentUIBusy', 'trackingAuthorizationStatus == .notDetermined', 'DispatchQueue.main.sync', 'consent_reused_pending']) {
  if (!source.includes(needle)) throw new Error(`Incomplete iOS consent lifecycle patch: ${needle}`);
}
if (!consent.includes('defer { self.consentUIBusy = false }')) throw new Error('Incomplete UMP UI gate');
console.log('Patched iOS consent lifecycle and active ATT presenter');