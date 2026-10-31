import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
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
      'CAPPluginMethod(name: "noteAppOpenDiagnostic", returnType: CAPPluginReturnPromise)',
      '@objc func noteAppOpenDiagnostic(_ call: CAPPluginCall)',
      'diagnosticAttemptId', 'adDidRecordImpression', 'diagnostic("load_requested")',
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
      'MRB_APP_OPEN_DIAGNOSTICS_V2', '"load_no_fill"', 'noteCachedAd("presentation_requested")',
      'call.reject(message, nil, nil, details)',
    ].join('\n');
    const androidSource = [
      '@PluginMethod public void getStoredConsentChoices(final PluginCall call)',
      '@PluginMethod public void getConsentEligibility(final PluginCall call)',
      '@PluginMethod public void discardPrivacyCaches(final PluginCall call)',
      'MRB_APP_OPEN_EXPIRY',
      'maxAdAgeMs',
      'discardExpiredAd',
    ].join('\n');
    const rewardedSource = [
      'LOVABLE_ATTEMPT_PATCH',
      'object RewardAdPluginEvents',
      ...['Showed', 'FailedToShow', 'Dismissed'].flatMap(event => [
        `RewardAdPluginEvents.INSTANCE.get${event}()`, `override val ${event} = "event"`,
      ]),
    ].join('\n');
    expect(await verify('ios', async () => iosSource)).toEqual([]);
    expect(await verify('android', async () => androidSource + '\n' + rewardedSource)).toEqual([]);
  });

  it.each(['Showed', 'FailedToShow', 'Dismissed'])('rejects private Rewarded field %s even alongside valid getters', async event => {
    const missing: string[] = await verify('android', async (path: string) => {
      const source = await readFile(`node_modules/@capacitor-community/admob/${path}`, 'utf8');
      return path.endsWith('AdRewardExecutor.java') ? source + `\nRewardAdPluginEvents.${event}` : source;
    });
    expect(missing).toContain(`AdRewardExecutor.java: privat fält RewardAdPluginEvents.${event}; använd INSTANCE.get${event}()`);
  });

  it('rejects an incompatible Kotlin event API', async () => {
    const missing: string[] = await verify('android', async (path: string) => {
      const source = await readFile(`node_modules/@capacitor-community/admob/${path}`, 'utf8');
      return path.endsWith('RewardAdPluginEvents.kt') ? source.replace('override val Showed', 'private val Showed') : source;
    });
    expect(missing).toContain('RewardAdPluginEvents.kt: publik getter getShowed() kan inte verifieras');
  });
});
