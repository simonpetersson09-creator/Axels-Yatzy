/** Diagnostic-only hooks, after privacy/fullscreen ownership patches. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('node_modules/@capacitor-community/admob');
const platform = process.argv[2];
const mark = 'MRB_AD_LOAD_DIAGNOSTICS';
const swiftHelper = `
    // ${mark}: only structured SDK errors and aggregate response timings.
    private func reportLoadFailure(_ error: Error, kind: String) {
        let ns = error as NSError
        let info = ns.userInfo[GADErrorUserInfoKeyResponseInfo] as? ResponseInfo
        let responses = info?.adNetworkInfoArray ?? []
        self.plugin?.notifyListeners("adLoadDiagnostic", data: [
            "kind": kind, "stage": "load_failed",
            "error_domain": ns.domain == "com.google.admob" ? ns.domain : "other",
            "error_code": ns.code, "response_info_available": info != nil,
            "adapter_count": responses.count,
            "adapter_latency_ms": Int(responses.reduce(0.0) { $0 + $1.latency } * 1000)
        ])
    }
`;
function javaHelper(banner) {
  return `
    // ${mark}: no raw SDK text, response IDs, network names or consent.
    private void reportLoadFailure(com.google.android.gms.ads.LoadAdError error) {
        try {
            com.google.android.gms.ads.ResponseInfo info = error.getResponseInfo();
            long latency = 0;
            int count = 0;
            if (info != null) {
                count = info.getAdapterResponses().size();
                for (com.google.android.gms.ads.AdapterResponseInfo response : info.getAdapterResponses()) latency += response.getLatencyMillis();
            }
            JSObject data = new JSObject();
            data.put("kind", "${banner ? 'banner' : 'interstitial'}"); data.put("stage", "load_failed");
            data.put("error_domain", "com.google.android.gms.ads".equals(error.getDomain()) ? error.getDomain() : "other");
            data.put("error_code", error.getCode()); data.put("response_info_available", info != null);
            data.put("adapter_count", count); data.put("adapter_latency_ms", latency);
            ${banner ? 'notifyListeners' : 'notifyListenersFunction.accept'}("adLoadDiagnostic", data);
        } catch (Exception ignored) { /* Diagnostics never affect existing callbacks. */ }
    }
`;
}
async function patch(path, transform, needles) {
  const file = resolve(root, path);
  let source = await readFile(file, 'utf8');
  if (!source.includes(mark)) {
    const replace = (anchor, replacement) => {
      if (!source.includes(anchor)) throw new Error(`Ad load diagnostics anchor missing: ${path}: ${anchor}`);
      source = source.replace(anchor, replacement);
    };
    transform(replace);
  }
  for (const needle of [mark, ...needles]) if (!source.includes(needle)) throw new Error(`Incomplete ad load diagnostics: ${path}: ${needle}`);
  await writeFile(file, source);
}
if (!platform || platform === 'ios') {
  const base = 'ios/Sources/AdMobPlugin/';
  await patch(base + 'Banner/BannerExecutor.swift', replace => {
    replace('    func showBanner(', swiftHelper + '\n    func showBanner(');
    replace('        // MRB_PRIVACY_BANNER_ERROR\n        guard bannerView === self.bannerView else { return }',
      '        // MRB_PRIVACY_BANNER_ERROR\n        guard bannerView === self.bannerView else { return }\n        reportLoadFailure(error, kind: "banner")');
  }, ['reportLoadFailure(error, kind: "banner")', 'GADErrorUserInfoKeyResponseInfo', '"adapter_count"']);
  await patch(base + 'Interstitial/AdInterstitialExecutor.swift', replace => {
    replace('    func prepareInterstitial(', swiftHelper + '\n    func prepareInterstitial(');
    replace('                if let error = error {', '                if let error = error {\n                    self.reportLoadFailure(error, kind: "interstitial")');
  }, ['self.reportLoadFailure(error, kind: "interstitial")', 'GADErrorUserInfoKeyResponseInfo', '"adapter_latency_ms"']);
}
if (!platform || platform === 'android') {
  const base = 'android/src/main/java/com/getcapacitor/community/admob/';
  await patch(base + 'banner/BannerExecutor.java', replace => {
    replace('    private ViewGroup mViewGroup;', '    private ViewGroup mViewGroup;\n' + javaHelper(true));
    replace('                        final ViewGroup bannerParent = resolveViewGroup();',
      '                        reportLoadFailure(adError);\n                        final ViewGroup bannerParent = resolveViewGroup();');
  }, ['reportLoadFailure(adError);', 'getAdapterResponses()', '"adapter_count"']);
  await patch(base + 'interstitial/AdInterstitialExecutor.java', replace => {
    replace('    public void showInterstitial(', javaHelper(false) + '\n    public void showInterstitial(');
    replace('                            delegate.onAdFailedToLoad(error);',
      '                            reportLoadFailure(error);\n                            delegate.onAdFailedToLoad(error);');
  }, ['reportLoadFailure(error);', 'getAdapterResponses()', '"adapter_latency_ms"']);
}
console.log('Verified diagnostic-only banner/interstitial SDK failure hooks');