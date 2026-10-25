/** Read UMP's existing choices without changing consent or requesting ads. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('node_modules/@capacitor-community/admob');
const platform = process.argv[2];
const marker = 'MRB_READ_CONSENT';
async function patch(path, anchor, addition, extra) {
  let source = await readFile(resolve(root, path), 'utf8');
  if (!source.includes(marker)) {
    if (!source.includes(anchor)) throw new Error(`Consent patch anchor missing: ${path}`);
    source = source.replace(anchor, addition + anchor);
  }
  if (extra) source = extra(source);
  if (!source.includes('getStoredConsentChoices') || !source.includes('IABTCF_PurposeConsents')) {
    throw new Error(`Consent reader verification failed: ${path}`);
  }
  await writeFile(resolve(root, path), source);
  console.log(`Patched consent reader: ${path}`);
}
if (!platform || platform === 'ios') {
  await patch('ios/Sources/AdMobPlugin/AdMobPlugin.swift', '    @objc func requestConsentInfo(_ call: CAPPluginCall) {',
    `    // ${marker}
    @objc func getStoredConsentChoices(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let status = ConsentInformation.shared.consentStatus == .obtained ? "OBTAINED" : "UNKNOWN"
            call.resolve([
                "status": status,
                "purposeConsents": UserDefaults.standard.string(forKey: "IABTCF_PurposeConsents") ?? ""
            ])
        }
    }

`, source => {
      const method = '        CAPPluginMethod(name: "requestConsentInfo", returnType: CAPPluginReturnPromise),';
      if (!source.includes(method)) throw new Error('Consent method registration anchor missing');
      if (!source.includes('import UserMessagingPlatform')) {
        source = source.replace('import GoogleMobileAds', 'import GoogleMobileAds\nimport UserMessagingPlatform');
      }
      const registration = '        CAPPluginMethod(name: "getStoredConsentChoices", returnType: CAPPluginReturnPromise),';
      if (!source.includes(registration)) source = source.replace(method, registration + '\n' + method);
      const eligibilityRegistration = '        CAPPluginMethod(name: "getConsentEligibility", returnType: CAPPluginReturnPromise),';
      if (!source.includes('@objc func getConsentEligibility(')) {
        source = source.replace('    @objc func requestConsentInfo(', `    // Read current UMP eligibility, including persisted consent, without refresh/reset.
    @objc func getConsentEligibility(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["canRequestAds": ConsentInformation.shared.canRequestAds])
        }
    }

    @objc func requestConsentInfo(`);
      }
      if (!source.includes(eligibilityRegistration)) source = source.replace(method, eligibilityRegistration + '\n' + method);
      // Stable registration order also when repairing a partial installed patch.
      source = source.replace(registration + '\n', '').replace(eligibilityRegistration + '\n', '');
      source = source.replace(method, registration + '\n' + eligibilityRegistration + '\n' + method);
      if (!source.includes('import UserMessagingPlatform') || !source.includes(registration)) {
        throw new Error('Consent reader iOS registration verification failed');
      }
      // UMP must work before Mobile Ads initializes. Bind on every entry point
      // (also privacy options), on the same main queue as the executor call.
      for (const action of ['requestConsentInfo', 'showConsentForm', 'showPrivacyOptionsForm']) {
        const callAnchor = `            self.consentExecutor.${action}(`;
        const binding = `            self.consentExecutor.plugin = self\n${callAnchor}`;
        if (!source.includes(binding)) {
          if (!source.includes(callAnchor)) throw new Error(`Consent presenter anchor missing: ${action}`);
          source = source.replace(callAnchor, binding);
        }
      }
      return source;
    });
}
if (!platform || platform === 'android') {
  await patch('android/src/main/java/com/getcapacitor/community/admob/AdMob.java', '    @PluginMethod\n    public void requestConsentInfo(final PluginCall call) {',
    `    // ${marker}
    @PluginMethod
    public void getStoredConsentChoices(final PluginCall call) {
        android.content.SharedPreferences prefs = getContext().getSharedPreferences(getContext().getPackageName() + "_preferences", android.content.Context.MODE_PRIVATE);
        int status = com.google.android.ump.UserMessagingPlatform.getConsentInformation(getContext()).getConsentStatus();
        JSObject result = new JSObject();
        result.put("status", status == com.google.android.ump.ConsentInformation.ConsentStatus.OBTAINED ? "OBTAINED" : "UNKNOWN");
        Object bits = prefs.getAll().get("IABTCF_PurposeConsents");
        result.put("purposeConsents", bits instanceof String ? (String) bits : "");
        call.resolve(result);
    }

`, source => {
    if (!source.includes('public void getConsentEligibility(')) {
      source = source.replace('    @PluginMethod\n    public void requestConsentInfo(', `    @PluginMethod
    public void getConsentEligibility(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("canRequestAds", com.google.android.ump.UserMessagingPlatform.getConsentInformation(getContext()).canRequestAds());
            call.resolve(result);
        });
    }

    @PluginMethod
    public void requestConsentInfo(`);
    }
    if (!source.includes('.canRequestAds()')) throw new Error('UMP eligibility reader missing');
    return source;
  });
}