import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';
it('patches existing diagnostic installs idempotently without changing ad/cache code', () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'ios-consent-lifecycle-'));
  const base = 'node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/';
  const names = ['AdMobPlugin.swift','Consent/ConsentExecutor.swift','AppOpen/AppOpenAdManager.swift'];
  try {
    for (const name of names) {
      const target=resolve(cwd,base,name); mkdirSync(dirname(target),{recursive:true});
      writeFileSync(target,readFileSync(resolve(base,name),'utf8'));
    }
    // Simulate the previous diagnostic version with its unguarded ATT method.
    const p=resolve(cwd,base,names[0]); let text=readFileSync(p,'utf8');
    text=text.replace(/    \/\/ MRB_IOS_CONSENT_LIFECYCLE[\s\S]*?(?=    @objc func setApplicationMuted)/, '    @objc func requestTrackingAuthorization(_ call: CAPPluginCall) { call.resolve([:]) }\n\n');
    text=text.replace('"consent_started", "consent_reused_pending", ', ''); writeFileSync(p,text);
    const c=resolve(cwd,base,names[1]); text=readFileSync(c,'utf8')
      .replace('    // MRB_IOS_CONSENT_LIFECYCLE: only read/write on the main queue.\n    var consentUIBusy = false\n','')
      .replace('            completionHandler: { error in\n                DispatchQueue.main.async {','            completionHandler: { error in')
      .replace('                }\n            })','            })')
      .replaceAll('        dispatchPrecondition(condition: .onQueue(.main))\n        guard !consentUIBusy else { call.reject("Consent UI pending"); return }\n        if #available(iOS 14, *) {\n            guard plugin?.isTrackingNativePending != true else { call.reject("ATT UI pending"); return }\n        }','')
      .replace('        consentUIBusy = true\n        Task { @MainActor in\n            defer { self.consentUIBusy = false }','        Task {')
      .replace('                consentUIBusy = true\n                Task { @MainActor in\n                    defer { self.consentUIBusy = false }','                Task { @MainActor in');
    writeFileSync(c,text);
    const script=resolve('scripts/patch-admob-ios-consent-lifecycle.js');
    execFileSync(process.execPath,[script],{cwd}); const first=names.map(n=>readFileSync(resolve(cwd,base,n),'utf8'));
    execFileSync(process.execPath,[script],{cwd}); expect(names.map(n=>readFileSync(resolve(cwd,base,n),'utf8'))).toEqual(first);
    expect(first[0]).toContain('guard ATTrackingManager.trackingAuthorizationStatus == .notDetermined');
    expect(first[0]).toContain('UIApplication.shared.applicationState != .active');
    expect(first[0]).toContain('!trackingNativePending');
    expect(first[2]).toBe(readFileSync(resolve(base,names[2]),'utf8'));
  } finally { rmSync(cwd,{recursive:true,force:true}); }
});