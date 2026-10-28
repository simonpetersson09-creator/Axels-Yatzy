import { describe, expect, it } from 'vitest';
// @ts-ignore plain JS build script (types may or may not resolve)
import { verify } from '../../scripts/verify-admob-patches.js';

describe('verify-admob-patches', () => {
  it('stops the iOS build when the discardPrivacyCaches registration is missing', async () => {
    const missing: string[] = await verify('ios', async () => 'func discardPrivacyCache()');
    expect(missing.some(m => m.includes('registrering av discardPrivacyCaches'))).toBe(true);
    expect(missing.some(m => m.includes('registrering av getStoredConsentChoices'))).toBe(true);
  });

  it('stops the iOS build when the App Open four-hour expiry patch is missing', async () => {
    const missing: string[] = await verify('ios', async () => 'func discardPrivacyCache()');
    expect(missing.some(m => m.includes('4-timmarsutgång'))).toBe(true);
    expect(missing.some(m => m.includes('4-timmarsgräns'))).toBe(true);
    expect(missing.some(m => m.includes('rensning av för gammal appstartsannons'))).toBe(true);
  });

  it('stops the Android build when the App Open four-hour expiry patch is missing', async () => {
    const missing: string[] = await verify('android', async () => 'public void discardPrivacyCaches(final PluginCall call)');
    expect(missing.some(m => m.includes('4-timmarsutgång'))).toBe(true);
    expect(missing.some(m => m.includes('rensning av för gammal appstartsannons'))).toBe(true);
  });

  it('accepts complete iOS and Android sources (all required AdMob pieces present)', async () => {
    const iosSource = [
      'MRB_READ_CONSENT',
      '@objc func getStoredConsentChoices(_ call: CAPPluginCall)',
      'CAPPluginMethod(name: "getStoredConsentChoices", returnType: CAPPluginReturnPromise)',
      '@objc func getConsentEligibility(_ call: CAPPluginCall)',
      'CAPPluginMethod(name: "getConsentEligibility", returnType: CAPPluginReturnPromise)',
      'import UserMessagingPlatform',
      'MRB_PRIVACY_CACHE',
      '@objc func discardPrivacyCaches(_ call: CAPPluginCall)',
      'CAPPluginMethod(name: "discardPrivacyCaches", returnType: CAPPluginReturnPromise)',
      '"privacyCacheVersion": 1',
      'self.consentExecutor.plugin = self\n            self.consentExecutor.showPrivacyOptionsForm(',
      'func discardPrivacyCache()',
      'MRB_APP_OPEN_EXPIRY',
      'maxAdAge',
      'discardExpiredAd',
    ].join('\n');
    const androidSource = [
      '@PluginMethod public void getStoredConsentChoices(final PluginCall call)',
      '@PluginMethod public void getConsentEligibility(final PluginCall call)',
      '@PluginMethod public void discardPrivacyCaches(final PluginCall call)',
      'MRB_APP_OPEN_EXPIRY',
      'maxAdAgeMs',
      'discardExpiredAd',
    ].join('\n');
    expect(await verify('ios', async () => iosSource)).toEqual([]);
    expect(await verify('android', async () => androidSource)).toEqual([]);
  });
});
