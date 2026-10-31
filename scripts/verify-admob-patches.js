/**
 * Stops the native build chain when a required AdMob patch or Capacitor method
 * registration is missing. The iOS pod compiles straight from node_modules, so
 * these files are exactly what Xcode builds.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('node_modules/@capacitor-community/admob');
const platform = process.argv[2] || 'ios';

const ios = 'ios/Sources/AdMobPlugin/';
const rewardedAndroid = 'android/src/main/java/com/getcapacitor/community/admob/rewarded/';
const checks = {
  ios: [
    [ios + 'AdMobPlugin.swift', [
      ['CAPPluginMethod(name: "noteAppOpenDiagnostic", returnType: CAPPluginReturnPromise)', 'registrering av noteAppOpenDiagnostic'],
      ['@objc func noteAppOpenDiagnostic(_ call: CAPPluginCall)', 'implementation av noteAppOpenDiagnostic'],
      ['diagnosticAttemptId', 'App Open försöks-ID'],
      ['MRB_READ_CONSENT', 'samtyckesläsning (patch-admob-consent.js)'],
      ['@objc func getStoredConsentChoices(_ call: CAPPluginCall)', 'implementation av getStoredConsentChoices'],
      ['CAPPluginMethod(name: "getStoredConsentChoices", returnType: CAPPluginReturnPromise)', 'registrering av getStoredConsentChoices'],
      ['@objc func getConsentEligibility(_ call: CAPPluginCall)', 'implementation av getConsentEligibility'],
      ['CAPPluginMethod(name: "getConsentEligibility", returnType: CAPPluginReturnPromise)', 'registrering av getConsentEligibility'],
      ['import UserMessagingPlatform', 'import av UserMessagingPlatform'],
      ['MRB_PRIVACY_CACHE', 'integritetscache (patch-admob-privacy-cache.js)'],
      ['@objc func discardPrivacyCaches(_ call: CAPPluginCall)', 'implementation av discardPrivacyCaches'],
      ['CAPPluginMethod(name: "discardPrivacyCaches", returnType: CAPPluginReturnPromise)', 'registrering av discardPrivacyCaches'],
      ['"privacyCacheVersion": 1', 'svar från discardPrivacyCaches'],
      ['self.consentExecutor.plugin = self\n            self.consentExecutor.showPrivacyOptionsForm(', 'samtyckesbindning för integritetsformuläret'],
    ]],
    [ios + 'Interstitial/AdInterstitialExecutor.swift', [['func discardPrivacyCache()', 'cacherensning för helskärmsannons']]],
    [ios + 'Rewarded/AdRewardExecutor.swift', [['func discardPrivacyCache()', 'cacherensning för belöningsannons']]],
    [ios + 'Banner/BannerExecutor.swift', [['func discardPrivacyCache()', 'cacherensning för banner']]],
    [ios + 'AppOpen/AppOpenAdPlugin.swift', [['func discardPrivacyCache()', 'cacherensning för appstartsannons'],
      ['call.reject(message, nil, nil, details)', 'strukturerad App Open felkod/feldomän']]],
    [ios + 'AppOpen/AppOpenAdManager.swift', [
      ['adDidRecordImpression', 'verklig App Open impression'],
      ['diagnostic("load_requested")', 'native App Open laddningsgräns'],
      ['MRB_APP_OPEN_EXPIRY', "appstartsannonsens 4-timmarsutgång (patch-admob-app-open.js)"],
      ['maxAdAge', '4-timmarsgräns för sparad appstartsannons'],
      ['discardExpiredAd', 'rensning av för gammal appstartsannons'],
      ['MRB_APP_OPEN_DIAGNOSTICS_V2', 'App Open livscykeldiagnostik V2'],
      ['"load_no_fill"', 'App Open no-fill klassificering'],
      ['noteCachedAd("presentation_requested")', 'App Open presentation separat från impression'],
    ]],
  ],
  android: [
    [rewardedAndroid + 'AdRewardExecutor.java', [
      ['LOVABLE_ATTEMPT_PATCH', 'Rewarded attemptId-patch'],
      ...['Showed', 'FailedToShow', 'Dismissed'].map(event => [
        `RewardAdPluginEvents.INSTANCE.get${event}()`, `Rewarded publik getter get${event}() (privata Kotlin-fält får inte användas)`,
      ]),
    ]],
    ['android/src/main/java/com/getcapacitor/community/admob/AdMob.java', [
      ['public void getStoredConsentChoices(final PluginCall call)', 'implementation av getStoredConsentChoices'],
      ['public void getConsentEligibility(final PluginCall call)', 'implementation av getConsentEligibility'],
      ['public void discardPrivacyCaches(final PluginCall call)', 'implementation av discardPrivacyCaches'],
    ]],
    ['android/src/main/java/com/getcapacitor/community/admob/appopen/AppOpenAdManager.kt', [
      ['MRB_APP_OPEN_EXPIRY', "appstartsannonsens 4-timmarsutgång (patch-admob-app-open-android.js)"],
      ['maxAdAgeMs', '4-timmarsgräns för sparad appstartsannons'],
      ['discardExpiredAd', 'rensning av för gammal appstartsannons'],
    ]],
  ],
};

export async function verify(target, read = path => readFile(resolve(root, path), 'utf8')) {
  const missing = [];
  for (const [path, needles] of checks[target]) {
    let source;
    try { source = await read(path); } catch { missing.push(`${path}: filen saknas`); continue; }
    for (const [needle, label] of needles) if (!source.includes(needle)) missing.push(`${path}: ${label}`);
  }
  // Android registers @PluginMethod methods only when annotated.
  if (target === 'android' && !missing.length) {
    const src = await read('android/src/main/java/com/getcapacitor/community/admob/AdMob.java');
    for (const name of ['getStoredConsentChoices', 'getConsentEligibility', 'discardPrivacyCaches']) {
      if (!new RegExp(`@PluginMethod\\s+public void ${name}\\(`).test(src)) missing.push(`AdMob.java: @PluginMethod för ${name}`);
    }
  }
  if (target === 'android') {
    try {
      const executor = await read(rewardedAndroid + 'AdRewardExecutor.java');
      for (const event of ['Showed', 'FailedToShow', 'Dismissed']) {
        if (new RegExp(`RewardAdPluginEvents\\.${event}\\b`).test(executor)) {
          missing.push(`AdRewardExecutor.java: privat fält RewardAdPluginEvents.${event}; använd INSTANCE.get${event}()`);
        }
      }
      const events = await read(rewardedAndroid + 'RewardAdPluginEvents.kt');
      if (!/object\s+RewardAdPluginEvents\b/.test(events)) missing.push('RewardAdPluginEvents.kt: Kotlin object saknas');
      for (const event of ['Showed', 'FailedToShow', 'Dismissed']) {
        if (!new RegExp(`override\\s+val\\s+${event}\\b`).test(events)) {
          missing.push(`RewardAdPluginEvents.kt: publik getter get${event}() kan inte verifieras`);
        }
      }
    } catch {
      missing.push('Rewarded: Java-executor eller Kotlin-händelse-API saknas');
    }
  }
  return missing;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = await verify(platform);
  if (missing.length) {
    console.error(`\n✖ AdMob-patchar saknas för ${platform}. Bygg INTE appen.\n`);
    for (const m of missing) console.error(`  - ${m}`);
    console.error(`\nKör "npm run cap:sync:${platform}" igen (inte "npx cap sync") och kontrollera felen ovan.\n`);
    process.exit(1);
  }
  console.log(`✔ AdMob-patchar och metodregistreringar verifierade (${platform}).`);
}
