import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';

it('repairs partial iOS patches and remains idempotent', () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'consent-patch-'));
  const script = resolve('scripts/patch-admob-consent.js');
  const target = resolve(cwd, 'node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/AdMobPlugin.swift');
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `import GoogleMobileAds
        CAPPluginMethod(name: "requestConsentInfo", returnType: CAPPluginReturnPromise),
    @objc func requestConsentInfo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.consentExecutor.requestConsentInfo(call, debugGeography, testDeviceIdentifiers, tagForUnderAgeOfConsent)
        }
    }
    @objc func showConsentForm(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.consentExecutor.showConsentForm(call)
        }
    }
    @objc func showPrivacyOptionsForm(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.consentExecutor.showPrivacyOptionsForm(call)
        }
    }
`);
    execFileSync(process.execPath, [script, 'ios'], { cwd });
    const patched = readFileSync(target, 'utf8');
    expect(patched).toContain('IABTCF_PurposeConsents');
    expect(patched).toContain('"canRequestAds": ConsentInformation.shared.canRequestAds');
    expect(patched).toContain('CAPPluginMethod(name: "getConsentEligibility"');
    for (const action of ['requestConsentInfo', 'showConsentForm', 'showPrivacyOptionsForm']) {
      const body = patched.split(`@objc func ${action}(`)[1]?.split('\n    }')[0];
      expect(body).toContain(`self.consentExecutor.plugin = self\n            self.consentExecutor.${action}(`);
      expect(body).not.toContain('MobileAds.shared.start');
      expect(body).not.toContain('initialize(');
    }
    // Emulate a partially applied patch: implementation exists, bridge registration absent.
    const registration = '        CAPPluginMethod(name: "getStoredConsentChoices", returnType: CAPPluginReturnPromise),\n';
    writeFileSync(target, patched.replace(registration, '').replace('import UserMessagingPlatform\n', ''));
    execFileSync(process.execPath, [script, 'ios'], { cwd });
    expect(readFileSync(target, 'utf8')).toBe(patched);
    execFileSync(process.execPath, [script, 'ios'], { cwd });
    expect(readFileSync(target, 'utf8')).toBe(patched);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

it('reads Android UMP eligibility directly and applies idempotently', () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'consent-android-'));
  const target = resolve(cwd, 'node_modules/@capacitor-community/admob/android/src/main/java/com/getcapacitor/community/admob/AdMob.java');
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, '    @PluginMethod\n    public void requestConsentInfo(final PluginCall call) {');
    const script = resolve('scripts/patch-admob-consent.js');
    execFileSync(process.execPath, [script, 'android'], { cwd });
    const patched = readFileSync(target, 'utf8');
    expect(patched).toContain('getConsentEligibility(final PluginCall call)');
    expect(patched).toContain('getConsentInformation(getContext()).canRequestAds()');
    expect(patched).not.toContain('.reset()');
    execFileSync(process.execPath, [script, 'android'], { cwd });
    expect(readFileSync(target, 'utf8')).toBe(patched);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});