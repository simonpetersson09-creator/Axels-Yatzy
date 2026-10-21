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
    writeFileSync(target, 'import GoogleMobileAds\n        CAPPluginMethod(name: "requestConsentInfo", returnType: CAPPluginReturnPromise),\n    @objc func requestConsentInfo(_ call: CAPPluginCall) {\n}\n');
    execFileSync(process.execPath, [script, 'ios'], { cwd });
    const patched = readFileSync(target, 'utf8');
    expect(patched).toContain('IABTCF_PurposeConsents');
    // Emulate a partially applied patch: implementation exists, bridge registration absent.
    const registration = '        CAPPluginMethod(name: "getStoredConsentChoices", returnType: CAPPluginReturnPromise),\n';
    writeFileSync(target, patched.replace(registration, '').replace('import UserMessagingPlatform\n', ''));
    execFileSync(process.execPath, [script, 'ios'], { cwd });
    expect(readFileSync(target, 'utf8')).toBe(patched);
    execFileSync(process.execPath, [script, 'ios'], { cwd });
    expect(readFileSync(target, 'utf8')).toBe(patched);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});