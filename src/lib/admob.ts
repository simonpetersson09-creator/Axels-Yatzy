/**
 * Google AdMob interstitial integration.
 *
 * Interstitials visas efter "Frivillig reklam" eller återgång till startsidan
 * efter en färdig match. Förladdning visar aldrig annonser.
 * App Open är ett separat format för appstart/återöppning.
 */
import { Capacitor } from '@capacitor/core';
import { readAdConsentChoices, type AdConsentChoices } from './ad-consent';
import { getRankedGames } from './local-stats';
import { trackEvent } from './analytics';
import { recordAppOpenDiagnostic } from './app-open-diagnostics';

/* ------------------------------------------------------------------ */
/* Central konfiguration                                               */
/* ------------------------------------------------------------------ */

/**
 * Plattformsberoende AdMob-konfiguration. iOS och Android har HELT separata
 * ID:n – iOS-ID:n används aldrig på Android. Ett tomt (null) ID betyder att
 * annonstypen är avstängd på den plattformen tills ett riktigt ID lagts in.
 */
type PlatformAdIds = {
  /** AdMob App ID (iOS: Info.plist, Android: AndroidManifest via scripts/). */
  appId: string | null;
  /** App Open-annons vid start. */
  appOpen: string | null;
  /** Frivillig annons ("Frivillig reklam"-knappen). */
  optional: string | null;
};

/** Googles officiella test-ID:n (används i development). */
const GOOGLE_TEST_IDS: Record<'ios' | 'android', Omit<PlatformAdIds, 'appId'>> = {
  ios: { appOpen: 'ca-app-pub-3940256099942544/5575463023', optional: 'ca-app-pub-3940256099942544/4411468910' },
  android: { appOpen: 'ca-app-pub-3940256099942544/9257395921', optional: 'ca-app-pub-3940256099942544/1033173712' },
};

export const ADMOB_IDS: Record<'ios' | 'android', PlatformAdIds> = {
  ios: {
    appId: 'ca-app-pub-7448540924654868~6494873071',
    appOpen: 'ca-app-pub-7448540924654868/8707432437',
    optional: 'ca-app-pub-7448540924654868/6422685490',
  },
  android: {
    appId: 'ca-app-pub-7448540924654868~1382689760',
    appOpen: 'ca-app-pub-7448540924654868/2580221366',
    optional: 'ca-app-pub-7448540924654868/2558286041',
  },
};

export const ADMOB_CONFIG = {
  /** Test-annonser i dev, riktiga annonser i release-bygget. */
  useTestAds: import.meta.env.DEV,
} as const;

function adPlatform(): 'ios' | 'android' | null {
  const p = Capacitor.getPlatform();
  return p === 'ios' || p === 'android' ? p : null;
}

/** Rätt ID för plattformen, eller null om annonstypen inte är konfigurerad där. */
function adUnitId(kind: 'appOpen' | 'optional'): string | null {
  const p = adPlatform();
  if (!p) return null;
  const real = ADMOB_IDS[p][kind];
  if (!real) return null; // aldrig annonser på en plattform utan egna riktiga ID:n
  // Utan plattformens eget App-ID står Googles prov-App-ID i manifestet; riktiga
  // annons-ID:n får aldrig blandas med det, så annonserna stängs av helt.
  if (!ADMOB_IDS[p].appId) return null;
  return ADMOB_CONFIG.useTestAds ? GOOGLE_TEST_IDS[p][kind] : real;
}

/** AdMob finns bara på native-plattform och när plugin:et är registrerat. */
export function isAdMobAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AdMob');
}

type AdMobModule = typeof import('@capacitor-community/admob');

let modulePromise: Promise<AdMobModule> | null = null;
let diagnosticListener: Promise<unknown> | null = null;
function attachIOSDiagnostics(mod: AdMobModule): void {
  if (adPlatform() !== 'ios' || diagnosticListener) return;
  try {
    const native = mod.AdMob as unknown as { addListener(name: string, callback: (data: Record<string, unknown>) => void): Promise<unknown> };
    diagnosticListener = native.addListener('appOpenDiagnostic', recordAppOpenDiagnostic)
      .catch(() => { diagnosticListener = null; });
  } catch { /* Old native builds: no telemetry, unchanged ads. */ }
}
function noteIOSDiagnostic(mod: AdMobModule, stage: string, fields: Record<string, unknown> = {}): void {
  if (adPlatform() !== 'ios') return;
  try {
    const native = mod.AdMob as typeof mod.AdMob & { noteAppOpenDiagnostic(input: Record<string, unknown>): Promise<void> };
    void native.noteAppOpenDiagnostic({ stage, ...fields }).catch(() => {});
  } catch { /* Diagnostics must never affect the flow. */ }
}
let initialized = false;
let initializationPromise: Promise<AdMobModule> | null = null;
let preparedAt = 0;
let preparing: Promise<boolean> | null = null;
let showing = false;
let dismissListenerAttached = false;
let lastPrepareError: string | undefined;

const PREPARED_TTL_MS = 45 * 60 * 1000; // AdMob-annonser blir inaktuella efter ~1h

/** Never let a native ad call hang the UI (seen on iPad: no reply at all). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label}_timeout`)), ms)),
  ]);
}

function reasonOf(err: unknown): string {
  const e = err as { message?: string; code?: unknown } | undefined;
  return String(e?.message ?? e?.code ?? err ?? 'unknown').slice(0, 160);
}

/**
 * Varför en annons aldrig efterfrågades (t.ex. få annonser på Android).
 * En gång per appstart och kind+orsak; inga UMP-val eller UMP-fel loggas.
 */
export type AdSkipReason =
  | 'ads_not_ready' | 'unavailable' | 'first_match_pending' | 'waiting_room'
  | 'other_ad_showing' | 'rewarded_suppression' | 'init_timeout' | 'initialization_not_ready' | 'load_failed';
const reportedSkips = new Set<string>();
function reportSkip(kind: 'appOpen' | 'rewarded', reason: AdSkipReason) {
  const key = `${kind}:${reason}`;
  if (reportedSkips.has(key)) return;
  reportedSkips.add(key);
  try { trackEvent('ad_skipped', { kind, reason }); } catch { /* best effort */ }
}
function initFailureReason(err: unknown): AdSkipReason {
  const r = reasonOf(err);
  return r === 'init_timeout' ? 'init_timeout' : r === 'consent_not_given' || r === 'privacy_transition' ? 'initialization_not_ready' : 'load_failed';
}

/** Silent diagnostics so failing ads (e.g. on iPad) show up in analytics. */
function reportAd(kind: 'appOpen' | 'optional' | 'postMatch' | 'banner' | 'interstitial', result: string, startedAt: number, reason?: string, context?: Record<string, unknown>) {
  try {
    trackEvent('ad_result', {
      ...context,
      kind,
      result,
      reason,
      ms: Date.now() - startedAt,
      ipad: typeof navigator !== 'undefined' && /iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1,
    });
  } catch { /* Diagnostics never affect ad presentation. */ }
}

const PREPARE_TIMEOUT_MS = 10_000;
const SHOW_TIMEOUT_MS = 8_000;

async function loadModule(): Promise<AdMobModule> {
  if (!modulePromise) modulePromise = import('@capacitor-community/admob');
  return modulePromise;
}

let consentPromise: Promise<boolean> | null = null;
let consentPending = false;
let consentWait: Promise<boolean> | null = null;
let privacyOptionsRequired = false;
let privacyChanging = false;
let privacyBlocked = false;
let adGeneration = 0;
let interstitialLoadId: string | undefined;
let interstitialLoadSequence = 0;
const interstitialLogSession = Date.now().toString(36);
const adAllowed = (generation: number) => !privacyChanging && !privacyBlocked && generation === adGeneration;

/** Logs only the native cache-bridge error (never consent choices or UMP payloads). */
function reportPrivacyCacheFailure(err: unknown): void {
  const error = err as { code?: unknown; message?: unknown } | undefined;
  const code = typeof error?.code === 'string' ? error.code.slice(0, 40) : '';
  const message = typeof error?.message === 'string' ? error.message.slice(0, 160) : String(err).slice(0, 160);
  console.warn('[admob] discardPrivacyCaches failed', code, message);
  void import('@/lib/analytics').then(({ trackEvent }) =>
    trackEvent('ad_privacy_cache_failed', { code, message }),
  ).catch(() => {});
}

async function discardPrivacyCaches(mod: AdMobModule): Promise<void> {
  const native = mod.AdMob as typeof mod.AdMob & {
    discardPrivacyCaches(): Promise<{ privacyCacheVersion: number }>;
  };
  let result: { privacyCacheVersion: number } | undefined;
  try {
    result = await native.discardPrivacyCaches();
  } catch (err) {
    reportPrivacyCacheFailure(err);
    throw err;
  }
  if (result?.privacyCacheVersion !== 1) {
    reportPrivacyCacheFailure(new Error(`unexpected_version:${String(result?.privacyCacheVersion)}`));
    throw new Error('privacy_cache_unavailable');
  }
  preparedAt = 0;
  rewardedPreparedAt = 0;
  preparing = null;
  rewardedPreparing = null;
  appOpenPreload = null;
  clearTimeout(bannerParkTimer);
  bannerGen++;
  bannerShown = false;
  bannerParked = false;
  bannerLoaded = false;
  shownMargin = -1;
  parkedMargin = -1;
  setBannerSpace(false);
}

/**
 * Refresh UMP and present its form when required. canRequestAds is request
 * eligibility, not acceptance or personalization. On errors read current UMP;
 * gameplay continues. UMP remains the only persisted consent authority.
 */
function ensureConsent(mod: AdMobModule): Promise<boolean> {
  attachIOSDiagnostics(mod);
  if (!consentPromise) {
    consentPending = true;
    noteIOSDiagnostic(mod, 'consent_started');
    let consentFailed = false;
    const observeWait = <T,>(operation: Promise<T>, ms: number, phase: string): Promise<T> => {
      const wait = withTimeout(operation, ms, phase);
      if (adPlatform() === 'ios') consentWait = wait.then(() => true, async error => {
        if (reasonOf(error) !== `${phase}_timeout`) return false;
        noteIOSDiagnostic(mod, `${phase}_timeout`);
        try {
          const native = mod.AdMob as typeof mod.AdMob & { getConsentEligibility(): Promise<{ canRequestAds: boolean }> };
          return (await withTimeout(native.getConsentEligibility(), 5_000, 'consent_eligibility'))?.canRequestAds === true;
        } catch { return false; }
      });
      return adPlatform() === 'ios' ? operation : wait;
    };
    consentPromise = (async () => {
      try {
        let info = await observeWait(mod.AdMob.requestConsentInfo(), 10_000, 'consent_info');
        if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) {
          info = await observeWait(mod.AdMob.showConsentForm(), 120_000, 'consent_form');
        }
        privacyOptionsRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
        noteIOSDiagnostic(mod, 'consent_finished');
        return info.canRequestAds === true;
      } catch (err) {
        consentFailed = true;
        const reason = reasonOf(err);
        noteIOSDiagnostic(mod, ['consent_info_timeout', 'consent_form_timeout'].includes(reason) ? reason : 'consent_failed');
        // Do not infer eligibility from status/purpose bits or a cached JS value.
        // UMP itself may still allow ads with consent saved before this error.
        try {
          const native = mod.AdMob as typeof mod.AdMob & {
            getConsentEligibility(): Promise<{ canRequestAds: boolean }>;
          };
          const current = await withTimeout(native.getConsentEligibility(), 5_000, 'consent_eligibility');
          noteIOSDiagnostic(mod, 'consent_finished');
          return current?.canRequestAds === true;
        } catch (err) {
          noteIOSDiagnostic(mod, reasonOf(err) === 'consent_eligibility_timeout' ? 'consent_eligibility_timeout' : 'consent_eligibility_failed');
          noteIOSDiagnostic(mod, 'consent_finished');
          return false; // Missing bridge, failed read or timeout: fail closed.
        }
      }
    })().finally(() => { consentPending = false; if (consentFailed) consentPromise = null; });
  } else if (consentPending) {
    noteIOSDiagnostic(mod, 'consent_reused_pending');
  }
  const owned = consentPromise;
  if (adPlatform() !== 'ios') return owned;
  // Follow phase changes without starting any new native operation.
  return (async () => {
    let wait = consentWait;
    while (consentPending && wait) {
      const eligible = await wait;
      if (wait === consentWait) {
        if (consentPending) return eligible;
        break;
      }
      wait = consentWait;
    }
    return owned;
  })();
}

/** Om knappen "Annonsinställningar" ska visas (bara där Google kräver det). */
export async function isAdPrivacyOptionsRequired(): Promise<boolean> {
  if (!isAdMobAvailable()) return false;
  try {
    const mod = await loadModule();
    await ensureConsent(mod);
    return privacyOptionsRequired;
  } catch {
    return false;
  }
}

/** Read existing UMP choices; never opens a form or changes consent. */
export async function getAdConsentChoices(): Promise<AdConsentChoices> {
  const unknown = readAdConsentChoices(undefined, undefined);
  if (!isAdMobAvailable()) return unknown;
  // Only allowlisted technical outcomes: never log consent values, status or errors.
  const report = (result: 'read_ok' | 'reader_unavailable' | 'read_timeout' | 'read_failed' | 'data_unavailable') => {
    void import('@/lib/analytics').then(({ trackEvent }) =>
      trackEvent('ad_consent_read', { result }),
    ).catch(() => {});
  };
  try {
    const mod = await loadModule();
    const reader = mod.AdMob as typeof mod.AdMob & {
      getStoredConsentChoices(): Promise<{ status: string; purposeConsents: string }>;
    };
    const saved = await withTimeout(reader.getStoredConsentChoices(), 5_000, 'stored_consent');
    const choices = readAdConsentChoices(saved?.status, saved?.purposeConsents);
    report(Object.values(choices).every(choice => choice === 'unknown') ? 'data_unavailable' : 'read_ok');
    return choices;
  } catch (err) {
    const error = err as { code?: unknown; message?: unknown } | undefined;
    const message = typeof error?.message === 'string' ? error.message : '';
    const unavailable = error?.code === 'UNIMPLEMENTED' || error?.code === 'UNAVAILABLE' || /not implemented|is not a function/i.test(message);
    report(unavailable ? 'reader_unavailable' : message === 'stored_consent_timeout' ? 'read_timeout' : 'read_failed');
    return unknown;
  }
}

/** Öppnar Googles ruta så spelaren kan ändra sitt annonsval. */
export async function showAdPrivacyOptions(): Promise<boolean> {
  if (!isAdMobAvailable()) return false;
  // Never release a native delegate or reward lifecycle while it may present.
  if (privacyChanging || showing || rewardedShowing || appOpenShowing) return false;
  if (adPlatform() === 'ios' && (consentPending || trackingAsked && !trackingSettled)) return false;
  privacyChanging = true;
  privacyBlocked = true;
  adGeneration++;
  if (adPlatform() === 'ios') {
    // Detach the old generation, not cancel its SDK request. Late callbacks
    // retain their own promise identity and cannot release the new owner.
    appOpenNativeLoad = null;
    appOpenPreload = null;
  }
  bannerGen++;
  try {
    const mod = await loadModule();
    await queueBannerOperation(() => discardPrivacyCaches(mod));
    await mod.AdMob.showPrivacyOptionsForm();
    consentPromise = null;
    const eligible = await ensureConsent(mod);
    // Discard again: a native operation issued before the boundary may have
    // finished while the form was open. Native generations reject late results.
    await discardPrivacyCaches(mod);
    privacyBlocked = !eligible;
    return true;
  } catch {
    // Fail closed, including on old native builds missing the cache bridge.
    // Never log choices or privacy-form error payloads.
    return false;
  } finally {
    privacyChanging = false;
    if (!privacyBlocked && bannerWanted) void showGameBanner(shownPlacement);
  }
}

let trackingAsked: Promise<void> | null = null;
let trackingSettled = false;
let trackingPrompted = false;
let trackingStartedAt = 0;
let firstAdRequestReported = false;

/**
 * Anonym diagnostik för Apples spårningsfråga. Spelarens svar (status) loggas
 * aldrig – bara tidsgränser/fel och ordningen mot första annonsförfrågan.
 */
export type TrackingDiagStage =
  | 'status_failed' | 'status_timeout' | 'request_failed' | 'request_timeout' | 'first_ad_request';
function reportTracking(stage: TrackingDiagStage, extra?: Record<string, unknown>) {
  try {
    trackEvent('ad_att_diag', { stage, ms: trackingStartedAt ? Date.now() - trackingStartedAt : null, ...extra });
  } catch {
    /* diagnostik får aldrig störa annonser */
  }
}
/** Registreras en gång per appstart, precis före första annonsförfrågan. */
function reportFirstAdRequest() {
  if (firstAdRequestReported || adPlatform() !== 'ios') return;
  firstAdRequestReported = true;
  reportTracking('first_ad_request', { att_settled: trackingSettled, prompted: trackingPrompted });
}
/**
 * Caller deadlines never release shared UMP/ATT/native ownership.
 */
async function initWithTimeout(ms: number): Promise<AdMobModule> {
  try {
    return await withTimeout(ensureInitialized(), ms, 'init');
  } catch (e) {
    if (reasonOf(e) === 'init_timeout') void loadModule().then(mod => noteIOSDiagnostic(mod, 'init_timeout')).catch(() => {});
    throw e;
  }
}
/**
 * Visar Apples "Tillåt spårning?" en gång (iOS bestämmer själv att den bara
 * visas när status är notDetermined). Fel blockerar aldrig annonser.
 */
export function ensureTrackingAuthorization(mod: AdMobModule): Promise<void> {
  if (adPlatform() !== 'ios') return Promise.resolve();
  if (!trackingAsked) {
    trackingAsked = (async () => {
      trackingStartedAt = Date.now();
      let status: string;
      try {
        const read = mod.AdMob.trackingAuthorizationStatus();
        void withTimeout(read, 5_000, 'att_status').catch(e => { if (reasonOf(e) === 'att_status_timeout') { noteIOSDiagnostic(mod, 'att_status_timeout'); reportTracking('status_timeout'); } });
        ({ status } = await read);
      } catch (e) {
        noteIOSDiagnostic(mod, reasonOf(e) === 'att_status_timeout' ? 'att_status_timeout' : 'att_status_failed');
        reportTracking(reasonOf(e) === 'att_status_timeout' ? 'status_timeout' : 'status_failed');
        return;
      }
      try {
        if (status !== 'notDetermined') { trackingSettled = true; return; }
        trackingPrompted = true;
        const request = mod.AdMob.requestTrackingAuthorization();
        void withTimeout(request, 120_000, 'att_request').catch(e => { if (reasonOf(e) === 'att_request_timeout') { noteIOSDiagnostic(mod, 'att_request_timeout'); reportTracking('request_timeout'); } });
        await request;
        const after = await mod.AdMob.trackingAuthorizationStatus();
        trackingSettled = after.status !== 'notDetermined';
      } catch (e) {
        noteIOSDiagnostic(mod, reasonOf(e) === 'att_request_timeout' ? 'att_request_timeout' : 'att_request_failed');
        reportTracking(reasonOf(e) === 'att_request_timeout' ? 'request_timeout' : 'request_failed');
      } finally {
        noteIOSDiagnostic(mod, 'att_finished');
      }
    })().finally(() => { if (!trackingSettled) trackingAsked = null; });
  }
  return trackingAsked;
}

async function ensureInitialized(): Promise<AdMobModule> {
  const generation = adGeneration;
  if (!adAllowed(generation)) throw new Error('privacy_transition');
  // Caller timeouts never cancel native initialization. Keep ownership until
  // the shared operation settles so late callers cannot start another one.
  if (!initializationPromise) {
    initializationPromise = initializeAds(generation).finally(() => {
      initializationPromise = null;
    });
  }
  const mod = await initializationPromise;
  if (!adAllowed(generation)) throw new Error('privacy_transition');
  return mod;
}

async function initializeAds(generation: number): Promise<AdMobModule> {
  const mod = await loadModule();
  // Samtycke först: inga annonser begärs innan spelaren svarat i EU.
  let canRequest = await ensureConsent(mod);
  // Eligibility reads after timeout do not mean a pending UMP UI has ended.
  // Keep the shared initialization parked; caller deadlines leave gameplay free.
  if (adPlatform() === 'ios' && consentPending && consentPromise) {
    canRequest = await consentPromise;
  }
  if (!adAllowed(generation)) throw new Error('privacy_transition');
  if (!canRequest) throw new Error('consent_not_given');
  if (adPlatform() === 'ios' && !trackingSettled) await ensureTrackingAuthorization(mod);
  if (!initialized) {
    // iOS: Apples spårningsfråga (ATT) efter Googles samtycke, bara en gång.
    if (!adAllowed(generation)) throw new Error('privacy_transition');
    reportFirstAdRequest();
    await mod.AdMob.initialize({
      initializeForTesting: ADMOB_CONFIG.useTestAds,
    });
    initialized = true;
  }
  if (!adAllowed(generation)) throw new Error('privacy_transition');
  if (!dismissListenerAttached) {
    dismissListenerAttached = true;
    try {
      // När annonsen stängts: markera som förbrukad och ladda nästa i bakgrunden.
      void mod.AdMob.addListener(mod.InterstitialAdPluginEvents.Dismissed, () => {
        showing = false;
        preparedAt = 0;
        void preloadInterstitial();
      });
      void mod.AdMob.addListener(mod.InterstitialAdPluginEvents.FailedToShow, () => {
        showing = false;
        preparedAt = 0;
      });
    } catch {
      /* listeners är best effort */
    }
  }
  return mod;
}

/**
 * Förladdar en interstitial i bakgrunden. Visar ALDRIG något.
 * Säker att anropa när som helst – den kan inte trigga visning.
 */
export async function preloadInterstitial(): Promise<boolean> {
  const generation = adGeneration;
  const startedAt = Date.now();
  let loadId = interstitialLoadId;
  const log = (result: string, reason?: string) => reportAd('interstitial', result, startedAt, reason, { loadId });
  if (!adAllowed(generation)) { log('load_skipped', 'ads_not_ready'); return false; }
  if (!isAdMobAvailable() || !adUnitId('optional')) { log('load_skipped', 'unavailable'); return false; }
  if (preparing) { log('load_reused_pending'); return preparing; }
  if (preparedAt && Date.now() - preparedAt < PREPARED_TTL_MS) { log('load_reused_ready'); return true; }
  if (preparedAt) log('cache_expired');
  interstitialLoadId = `${interstitialLogSession}:${++interstitialLoadSequence}`;
  loadId = interstitialLoadId;
  let stage = 'initialization';
  log('load_started');

  preparing = (async () => {
    try {
      const mod = await initWithTimeout(PREPARE_TIMEOUT_MS);
      if (!adAllowed(generation)) { log('load_discarded', 'ads_state_changed'); return false; }
      const adId = adUnitId('optional');
      if (!adId) { log('load_skipped', 'unavailable'); return false; }
      stage = 'prepare';
      log('load_requested');
      await withTimeout(mod.AdMob.prepareInterstitial({
        adId,
        isTesting: ADMOB_CONFIG.useTestAds,
      }), PREPARE_TIMEOUT_MS, 'prepare');
      if (!adAllowed(generation)) { log('load_discarded', 'ads_state_changed'); return false; }
      preparedAt = Date.now();
      log('loaded');
      return true;
    } catch (err) {
      if (adAllowed(generation)) { lastPrepareError = reasonOf(err); preparedAt = 0; }
      // Initialization includes UMP: never record its errors or choices.
      log('load_failed', stage === 'prepare' ? reasonOf(err) : reasonOf(err) === 'init_timeout' ? 'init_timeout' : 'initialization_not_ready');
      return false;
    } finally {
      if (generation === adGeneration) preparing = null;
    }
  })();

  return preparing;
}

export type ShowAdResult = 'shown' | 'unavailable' | 'failed' | 'busy';

/**
 * Visar en interstitial efter tryck på "Frivillig reklam".
 */
export async function showOptionalInterstitial(): Promise<ShowAdResult> {
  return showInterstitial('optional');
}

/** Result exit only: skip unprepared ads rather than delaying navigation. No XP. */
export async function showPostMatchInterstitial(context?: { matchKey: string; action: 'home' | 'replay' }): Promise<ShowAdResult> {
  return showInterstitial('postMatch', context);
}

async function showInterstitial(kind: 'optional' | 'postMatch', context?: { matchKey: string; action: 'home' | 'replay' }): Promise<ShowAdResult> {
  const generation = adGeneration;
  const startedAt = Date.now();
  const details = { ...context, loadId: interstitialLoadId, cacheAgeMs: preparedAt ? Date.now() - preparedAt : null };
  const skip = (result: ShowAdResult, reason: string) => {
    if (kind === 'postMatch') reportAd(kind, 'skipped', startedAt, reason, details);
    return result;
  };
  if (!adAllowed(generation)) return skip('busy', 'ads_not_ready');
  if (!isAdMobAvailable()) return skip('unavailable', 'native_unavailable');
  if (showing || rewardedShowing || appOpenShowing) return skip('busy', 'another_ad_active');
  if (kind === 'postMatch' && (!preparedAt || Date.now() - preparedAt >= PREPARED_TTL_MS)) return skip('unavailable', preparedAt ? 'cache_expired' : preparing ? 'still_loading' : 'not_loaded');
  showing = true;
  let lastShowError: string | undefined;
  const listeners: Awaited<ReturnType<AdMobModule['AdMob']['addListener']>>[] = [];
  try {
    const ready = kind === 'postMatch' || await preloadInterstitial();
    if (!ready) {
      showing = false;
      reportAd(kind, 'load_failed', startedAt, lastPrepareError);
      return 'failed';
    }
    const mod = await loadModule();
    if (!adAllowed(generation)) return skip('unavailable', 'ads_state_changed');
    // Native presentation resolves immediately; navigation waits for dismissal.
    let settle: (result: ShowAdResult) => void = () => {};
    const closed = new Promise<ShowAdResult>((resolve) => { settle = resolve; });
    listeners.push(await mod.AdMob.addListener(mod.InterstitialAdPluginEvents.Dismissed, () => settle('shown')));
    listeners.push(await mod.AdMob.addListener(mod.InterstitialAdPluginEvents.FailedToShow, () => settle('failed')));
    if (!adAllowed(generation)) return skip('unavailable', 'ads_state_changed');
    if (kind === 'postMatch') {
      reportAd(kind, 'show_requested', startedAt, undefined, details);
      suppressAppOpenUntil = Date.now() + APP_OPEN_SUPPRESS_AFTER_REWARDED_MS;
      // Never free an uncancellable native attempt just because a timer elapsed.
      void mod.AdMob.showInterstitial().catch((err) => { lastShowError = reasonOf(err); settle('failed'); });
    } else {
      await withTimeout(mod.AdMob.showInterstitial(), SHOW_TIMEOUT_MS, 'show');
    }
    const result = await closed;
    preparedAt = 0; // förbrukad – laddas om via Dismissed-lyssnaren
    reportAd(kind, result === 'shown' ? 'shown' : 'show_failed', startedAt, lastShowError, details);
    if (result === 'shown') void preloadInterstitial();
    return result;
  } catch (err) {
    preparedAt = 0;
    reportAd(kind, 'show_failed', startedAt, reasonOf(err), details);
    return 'failed';
  } finally {
    if (kind === 'postMatch') suppressAppOpenUntil = Date.now() + APP_OPEN_SUPPRESS_AFTER_REWARDED_MS;
    await Promise.all(listeners.map((listener) => listener.remove().catch(() => {})));
    showing = false;
  }
}

/* ------------------------------------------------------------------ */
/* Rewarded (iOS only): frivillig XP-annons                             */
/* ------------------------------------------------------------------ */

/** Rewarded ad units for the optional XP button (own IDs per platform). */
const REWARDED_IDS: Record<'ios' | 'android', { real: string; test: string }> = {
  ios: { real: 'ca-app-pub-7448540924654868/2605382885', test: 'ca-app-pub-3940256099942544/1712485313' },
  android: { real: 'ca-app-pub-7448540924654868/7926737182', test: 'ca-app-pub-3940256099942544/5224354917' },
};
/** Android: load and "ad actually opened" limits; never cuts a running ad. */
const ANDROID_REWARDED_LOAD_TIMEOUT_MS = 20_000;
const ANDROID_REWARDED_OPEN_TIMEOUT_MS = 20_000;
/** Reward callback may arrive just after dismissal on some SDK versions. */
const REWARD_GRACE_MS = 1500;
/** Start ad stays away this long (60 s) after the rewarded or post-match ad closes. */
const APP_OPEN_SUPPRESS_AFTER_REWARDED_MS = 60_000;

let rewardedShowing = false;
let rewardedPreparedAt = 0;
let rewardedPreparing: Promise<boolean> | null = null;
let suppressAppOpenUntil = 0;

function rewardedUnitId(): string | null {
  const p = adPlatform();
  if (!p || !ADMOB_IDS[p].appId) return null;
  return ADMOB_CONFIG.useTestAds ? REWARDED_IDS[p].test : REWARDED_IDS[p].real;
}

/** Rewarded on iOS and Android. */
export function usesRewardedOptionalAd(): boolean {
  return rewardedUnitId() !== null;
}

export async function preloadRewarded(): Promise<boolean> {
  const generation = adGeneration;
  if (!adAllowed(generation)) { reportSkip('rewarded', 'ads_not_ready'); return false; }
  const adId = rewardedUnitId();
  if (!isAdMobAvailable() || !adId) { reportSkip('rewarded', 'unavailable'); return false; }
  if (rewardedPreparing) return rewardedPreparing;
  if (rewardedPreparedAt && Date.now() - rewardedPreparedAt < PREPARED_TTL_MS) return true;
  rewardedPreparing = (async () => {
    let initDone = false;
    try {
      const loadMs = adPlatform() === 'android' ? ANDROID_REWARDED_LOAD_TIMEOUT_MS : PREPARE_TIMEOUT_MS;
      const mod = await initWithTimeout(loadMs);
      initDone = true;
      if (!adAllowed(generation)) return false;
      await withTimeout(mod.AdMob.prepareRewardVideoAd({ adId, isTesting: ADMOB_CONFIG.useTestAds }), loadMs, 'prepare');
      if (!adAllowed(generation)) return false;
      rewardedPreparedAt = Date.now();
      return true;
    } catch (err) {
      if (adAllowed(generation)) { lastPrepareError = reasonOf(err); rewardedPreparedAt = 0; }
      reportSkip('rewarded', initDone ? 'load_failed' : initFailureReason(err));
      return false;
    } finally {
      if (generation === adGeneration) rewardedPreparing = null;
    }
  })();
  return rewardedPreparing;
}

export type RewardedResult = 'rewarded' | 'not_earned' | 'unavailable' | 'failed' | 'busy' | 'pending';

/**
 * Button status for the rewarded ad, shared app-wide so it survives page
 * changes. 'waiting' = the ad has not opened in time but may still open; the
 * attempt is never auto-reset (the SDK cannot cancel it), so no new attempt
 * can overlap it. It ends only on the SDK's dismiss/fail (or app restart).
 */
export type RewardedState = 'idle' | 'loading' | 'showing' | 'waiting';
let rewardedState: RewardedState = 'idle';
const rewardedStateListeners = new Set<(s: RewardedState) => void>();
function setRewardedState(s: RewardedState) {
  if (s === rewardedState) return;
  rewardedState = s;
  rewardedStateListeners.forEach((fn) => fn(s));
}
export function getRewardedState(): RewardedState { return rewardedState; }
export function subscribeRewardedState(fn: (s: RewardedState) => void): () => void {
  rewardedStateListeners.add(fn);
  return () => { rewardedStateListeners.delete(fn); };
}
let rewardedAttemptSeq = 0;
let activeRewardedAttempt = 0;
let lateRewardHandler: (() => void) | null = null;

/**
 * Patched native plugin (scripts/patch-admob-rewarded.js) tags every rewarded
 * event with our attemptId and resolves the show call once on dismissal with
 * { rewarded }. Ids of attempts that closed unrewarded are kept so a Rewarded
 * event arriving after dismissal pays exactly once, to the right attempt.
 */
type RewardEvent = { attemptId?: string } | undefined;
type ListenerHandle = { remove: () => Promise<void> };
/** addListener for rewarded events with the attemptId payload of the patched plugin. */
const onReward = (mod: AdMobModule) =>
  mod.AdMob.addListener as unknown as (event: string, fn: (ev: RewardEvent) => void) => Promise<ListenerHandle>;
const closedUnrewarded = new Set<string>();
const closedRewardHandlers = new Map<string, () => void>();
let lateRewardListenerAttached = false;
async function ensureLateRewardListener(mod: AdMobModule) {
  if (lateRewardListenerAttached) return;
  lateRewardListenerAttached = true;
  await onReward(mod)(mod.RewardAdPluginEvents.Rewarded, (ev: RewardEvent) => {
    const aid = ev?.attemptId;
    if (aid && closedUnrewarded.delete(aid)) {
      const handler = closedRewardHandlers.get(aid) ?? lateRewardHandler;
      closedRewardHandlers.delete(aid);
      handler?.();
    }
  });
}
function rememberUnrewarded(aid: string, handler?: () => void) {
  closedUnrewarded.add(aid);
  if (handler) closedRewardHandlers.set(aid, handler);
  if (closedUnrewarded.size > 20) {
    const oldest = closedUnrewarded.values().next().value;
    if (oldest) { closedUnrewarded.delete(oldest); closedRewardHandlers.delete(oldest); }
  }
}

/**
 * Receives a reward that was earned AFTER showOptionalRewarded already
 * returned (Android ad opened after the open timeout). Called at most once
 * per attempt, and never for an attempt that already returned 'rewarded'.
 */
export function setLateRewardHandler(fn: (() => void) | null): void {
  lateRewardHandler = fn;
}

/**
 * Shows the rewarded ad. ONLY from the player's tap. Each attempt can yield
 * at most one reward, and only if the SDK fired its Rewarded event — either
 * as the 'rewarded' result or, after an open timeout, via the late handler.
 * The attempt (and its listeners) stays alive until the SDK finishes it, so a
 * new attempt can never overlap or receive the old attempt's events.
 */
export async function showOptionalRewarded(options: { waitForCompletion?: boolean; onLateReward?: () => void } = {}): Promise<RewardedResult> {
  const generation = adGeneration;
  if (!adAllowed(generation)) return 'busy';
  if (!isAdMobAvailable() || !rewardedUnitId()) return 'unavailable';
  if (rewardedShowing || showing || appOpenShowing) return 'busy';
  rewardedShowing = true;
  setRewardedState('loading');
  const id = ++rewardedAttemptSeq;
  activeRewardedAttempt = id;
  const startedAt = Date.now();
  const listeners: Awaited<ReturnType<AdMobModule['AdMob']['addListener']>>[] = [];
  const release = () => {
    void Promise.all(listeners.map((l) => l.remove().catch(() => {})));
    if (activeRewardedAttempt === id) activeRewardedAttempt = 0;
    suppressAppOpenUntil = Date.now() + APP_OPEN_SUPPRESS_AFTER_REWARDED_MS;
    rewardedShowing = false;
    setRewardedState('idle');
    void preloadRewarded();
  };
  let lifecycleOwnsRelease = false;
  try {
    if (!(await preloadRewarded())) {
      reportAd('optional', 'load_failed', startedAt, lastPrepareError);
      return 'failed';
    }
    const mod = await loadModule();
    const E = mod.RewardAdPluginEvents;
    if (!adAllowed(generation)) return 'unavailable';
    const nativeId = `${startedAt.toString(36)}-${id}`;
    // Tagged events (patched native) must match this attempt; untagged ones
    // (unpatched native) fall back to "the only active attempt".
    const mine = (ev?: RewardEvent) => (ev?.attemptId != null ? ev.attemptId === nativeId : activeRewardedAttempt === id);
    await ensureLateRewardListener(mod);
    let earned = false;
    let opened = false;
    let finish: (r: RewardedResult) => void = () => {};
    const lifecycle = new Promise<RewardedResult>((resolve) => {
      let done = false;
      finish = (r) => { if (!done) { done = true; resolve(r); } };
    });
    listeners.push(await onReward(mod)(E.Rewarded, (ev: RewardEvent) => { if (mine(ev)) earned = true; }));
    listeners.push(await onReward(mod)(E.Showed, (ev: RewardEvent) => {
      if (!mine(ev)) return;
      opened = true;
      setRewardedState('showing');
      suppressAppOpenUntil = Date.now() + APP_OPEN_SUPPRESS_AFTER_REWARDED_MS;
    }));
    listeners.push(await onReward(mod)(E.FailedToShow, (ev: RewardEvent) => { if (mine(ev)) finish(earned ? 'rewarded' : 'failed'); }));
    listeners.push(await onReward(mod)(E.Dismissed, (ev: RewardEvent) => {
      if (!mine(ev)) return;
      if (ev?.attemptId != null) return; // patched native: the show call's resolution decides
      if (earned) { finish('rewarded'); return; }
      setTimeout(() => finish(earned ? 'rewarded' : 'not_earned'), REWARD_GRACE_MS);
    }));
    rewardedPreparedAt = 0; // consumed as soon as we try to show it
    if (!adAllowed(generation)) return 'unavailable';
    suppressAppOpenUntil = Date.now() + APP_OPEN_SUPPRESS_AFTER_REWARDED_MS;
    // Both native plugins resolve the show call ONLY from the SDK's
    // earned-reward callback, so resolution is a second reward signal; the
    // attempt still yields at most one reward. A rejection only ends the
    // attempt if the ad has not opened.
    (mod.AdMob.showRewardVideoAd as (o: object) => Promise<unknown>)({ attemptId: nativeId }).then(
      (res) => {
        const r = res as { patched?: boolean; rewarded?: boolean; attemptId?: string } | undefined;
        if (r?.patched) {
          if (r.rewarded) earned = true;
          if (!earned) rememberUnrewarded(nativeId, options.onLateReward);
          finish(earned ? 'rewarded' : 'not_earned');
          return;
        }
        if (mine()) earned = true; // unpatched native resolves only on reward
      },
      () => { if (!opened) finish(earned ? 'rewarded' : 'failed'); },
    );

    // Not opened in time: tell the player we are still waiting. The attempt is
    // NOT released — the SDK may still open this ad, and a late open + reward
    // pays exactly once via the late handler.
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    const openTimeout = new Promise<'open_timeout'>((r) => {
      openTimer = setTimeout(() => {
        if (!opened && !earned) { setRewardedState('waiting'); r('open_timeout'); }
      }, adPlatform() === 'android' ? ANDROID_REWARDED_OPEN_TIMEOUT_MS : PREPARE_TIMEOUT_MS * 2);
    });
    lifecycleOwnsRelease = true;
    void lifecycle.then(() => { clearTimeout(openTimer); });

    const first = options.waitForCompletion ? await lifecycle : await Promise.race([lifecycle, openTimeout]);
    if (first !== 'open_timeout') {
      release();
      reportAd('optional', first, startedAt);
      return first;
    }
    reportAd('optional', 'open_timeout', startedAt);
    void lifecycle.then((late) => {
      release();
      reportAd('optional', `late_${late}`, startedAt);
      if (late === 'rewarded') (options.onLateReward ?? lateRewardHandler)?.();
    });
    return 'pending';
  } catch (err) {
    rewardedPreparedAt = 0;
    reportAd('optional', 'show_failed', startedAt, reasonOf(err));
    return 'failed';
  } finally {
    if (!lifecycleOwnsRelease) release();
  }
}

/* ------------------------------------------------------------------ */
/* App Open-annons (automatisk startannons; plattform med eget ID)    */
/* Helt separat från interstitial-flödet för "Frivillig reklam".       */
/* ------------------------------------------------------------------ */

/** Laddas annonsen inte inom denna tid (12 s) visas den inte alls denna start. */
const APP_OPEN_LOAD_TIMEOUT_MS = 12_000;
/** One minute avoids burst retries without a timer or changing presentation eligibility. iOS only. */
export const APP_OPEN_NO_FILL_RETRY_MS = 60_000;
export type AppOpenLoadSource = 'startup' | 'resume' | 'background' | 'preload' | 'after_presentation';
let appOpenRetryAfter = 0;

let appOpenShowing = false;
let appOpenPreload: Promise<boolean> | null = null;
/** The native load itself; cleared only when the SDK answers, never on a JS timeout. */
let appOpenNativeLoad: Promise<unknown> | null = null;
let appOpenAttemptId: string | undefined;
let appOpenRevenueListener = false;

/** One native App Open load at a time: a timed-out wait reuses the running load. */
function loadAppOpenOnce(mod: AdMobModule, adId: string, ms: number, label: string, source: AppOpenLoadSource, generation: number): Promise<unknown> {
  if (!adAllowed(generation)) return Promise.reject(new Error('app_open_invalidated'));
  if (appOpenNativeLoad) {
    noteIOSDiagnostic(mod, 'load_reused_pending', { attempt_id: appOpenAttemptId, source });
  } else if (adPlatform() === 'ios' && Date.now() < appOpenRetryAfter) {
    noteIOSDiagnostic(mod, 'retry_paused', { attempt_id: appOpenAttemptId, source, retry_remaining_ms: appOpenRetryAfter - Date.now() });
    return Promise.reject(new Error('app_open_retry_paused'));
  }
  if (!appOpenNativeLoad) {
    const attemptId = adPlatform() === 'ios' ? crypto.randomUUID() : undefined;
    appOpenAttemptId = attemptId;
    const p = mod.AdMob.loadAppOpen({ adId, ...(attemptId ? { diagnosticAttemptId: attemptId, diagnosticTestMode: ADMOB_CONFIG.useTestAds, diagnosticSource: source } : {}) });
    appOpenNativeLoad = p;
    // Observe the actual SDK settlement, including after the caller's timeout.
    p.then(() => {}, (err: unknown) => {
      const failure = err as { code?: unknown; data?: { error_domain?: unknown; error_code?: unknown } } | undefined;
      if (adPlatform() === 'ios' && adAllowed(generation) && appOpenNativeLoad === p && (failure?.code === 'APP_OPEN_NO_FILL' ||
        (failure?.data?.error_domain === 'com.google.admob' && failure.data.error_code === 1))) {
        appOpenRetryAfter = Date.now() + APP_OPEN_NO_FILL_RETRY_MS;
      }
    }).finally(() => { if (appOpenNativeLoad === p) appOpenNativeLoad = null; });
  }
  const ownedLoad = appOpenNativeLoad;
  const ownedId = appOpenAttemptId;
  return withTimeout(ownedLoad, ms, label).then(result => {
    if (!adAllowed(generation)) throw new Error('app_open_invalidated');
    return result;
  }).catch(err => {
    if (adPlatform() === 'ios' && reasonOf(err) === `${label}_timeout`) {
      recordAppOpenDiagnostic({ stage: 'load_wait_timeout', attempt_id: ownedId, occurred_at_ms: Date.now(), ad_unit_id: adId, test_mode: ADMOB_CONFIG.useTestAds });
    }
    throw err;
  });
}

/** Impression-level revenue from Google (paid event) for App Open ads. No consent data. */
function attachAppOpenRevenue(mod: AdMobModule) {
  if (appOpenRevenueListener) return;
  appOpenRevenueListener = true;
  try {
    void mod.AdMob.addListener(mod.AppOpenAdPluginEvents.AdImpression, (d: {
      valueMicros?: number; currencyCode?: string; precision?: number | string; networkName?: string;
    }) => {
      void import('@/lib/analytics').then(({ trackEvent }) => trackEvent('ad_revenue', {
        kind: 'appOpen',
        value_micros: Number(d?.valueMicros ?? 0),
        currency: String(d?.currencyCode ?? ''),
        precision: d?.precision ?? null,
        network: String(d?.networkName ?? '').slice(0, 120),
      })).catch(() => {});
    });
  } catch { appOpenRevenueListener = false; }
}

/** Laddar nästa App Open-annons i förväg så den kan visas direkt vid nästa start. */
export function preloadAppOpenAd(source: AppOpenLoadSource = 'preload'): Promise<boolean> {
  const generation = adGeneration;
  if (!adAllowed(generation)) { reportSkip('appOpen', 'ads_not_ready'); return Promise.resolve(false); }
  if (getRankedGames() < 1) { reportSkip('appOpen', 'first_match_pending'); return Promise.resolve(false); }
  const adId = adUnitId('appOpen');
  if (!isAdMobAvailable() || !adId) { reportSkip('appOpen', 'unavailable'); return Promise.resolve(false); }
  if (appOpenPreload) {
    void loadModule().then(mod => noteIOSDiagnostic(mod, 'preload_reused_pending', { attempt_id: appOpenAttemptId, source })).catch(() => {});
    return appOpenPreload;
  }
  appOpenPreload = (async () => {
    let initDone = false;
    try {
      const mod = await initWithTimeout(PREPARE_TIMEOUT_MS);
      initDone = true;
      if (!adAllowed(generation)) return false;
      attachAppOpenRevenue(mod);
      const { value } = await mod.AdMob.isAppOpenLoaded();
      if (!adAllowed(generation)) return false;
      if (value) return true;
      await loadAppOpenOnce(mod, adId, 20_000, 'load', source, generation);
      if (!adAllowed(generation)) return false;
      return (await mod.AdMob.isAppOpenLoaded()).value;
    } catch (err) {
      reportSkip('appOpen', initDone ? 'load_failed' : initFailureReason(err));
      return false;
    } finally {
      if (generation === adGeneration) appOpenPreload = null;
    }
  })();
  return appOpenPreload;
}

/**
 * Laddar och visar en App Open-annons vid appstart. Returnerar true om den
 * visades. Kastar aldrig; misslyckas tyst så att appen fortsätter direkt.
 */
export async function showAppOpenAd(canShow: () => boolean = () => true, source: AppOpenLoadSource = 'startup'): Promise<boolean> {
  const generation = adGeneration;
  if (!canShow()) return false;
  if (!adAllowed(generation)) { reportSkip('appOpen', 'ads_not_ready'); return false; }
  // New players get one complete match before any startup/resume App Open ad.
  if (getRankedGames() < 1) { reportSkip('appOpen', 'first_match_pending'); return false; }
  const { waitingRoomAdBlocked } = await import('./waiting-room');
  if (waitingRoomAdBlocked()) { reportSkip('appOpen', 'waiting_room'); return false; }
  const adId = adUnitId('appOpen');
  if (!isAdMobAvailable() || !adId) { reportSkip('appOpen', 'unavailable'); return false; }
  if (appOpenShowing || showing || rewardedShowing) { reportSkip('appOpen', 'other_ad_showing'); return false; }
  // Never show the start ad right after the player returns from the rewarded ad.
  if (Date.now() < suppressAppOpenUntil) { reportSkip('appOpen', 'rewarded_suppression'); return false; }
  appOpenShowing = true;
  const startedAt = Date.now();
  let release = true;
  let presentationAttempted = false;
  try {
    let mod: AdMobModule;
    try {
      mod = await initWithTimeout(APP_OPEN_LOAD_TIMEOUT_MS);
    } catch (err) {
      reportSkip('appOpen', initFailureReason(err));
      throw err;
    }
    attachAppOpenRevenue(mod);
    if (!adAllowed(generation)) return false;
    // A preload already running (started at cold start) is awaited, not doubled.
    if (appOpenPreload) await withTimeout(appOpenPreload, APP_OPEN_LOAD_TIMEOUT_MS, 'preload').catch(() => {});
    const pre = await mod.AdMob.isAppOpenLoaded();
    if (!adAllowed(generation)) return false;
    if (!pre.value) {
      if (!canShow() || waitingRoomAdBlocked()) return false;
      await loadAppOpenOnce(mod, adId, APP_OPEN_LOAD_TIMEOUT_MS, 'load', source, generation);
    }
    const { value } = await mod.AdMob.isAppOpenLoaded();
    if (!adAllowed(generation)) return false;
    if (!value) { reportAd('appOpen', 'not_loaded', startedAt); return false; }
    // Loaded too late (player already left the start screen): never cover a game.
    if (getRankedGames() < 1 || !canShow() || waitingRoomAdBlocked()) { reportAd('appOpen', 'skipped_left_home', startedAt); return false; }
    presentationAttempted = true;
    const showP = mod.AdMob.showAppOpen();
    try {
      await withTimeout(showP, SHOW_TIMEOUT_MS, 'show');
      reportAd('appOpen', pre.value ? 'shown_preloaded' : 'shown', startedAt);
    } catch (err) {
      if (reasonOf(err) !== 'show_timeout') throw err;
      // Slow to confirm: the ad may still be on screen — wait for the real outcome.
      release = false;
      showP.then(
        () => reportAd('appOpen', 'shown_late', startedAt),
        (e) => reportAd('appOpen', 'failed', startedAt, reasonOf(e)),
      ).finally(() => { appOpenShowing = false; void preloadAppOpenAd('after_presentation'); });
      return true;
    }
    return true;
  } catch (err) {
    // Free SDK error messages never belong in App Open diagnostics.
    const reason = reasonOf(err);
    reportAd('appOpen', 'failed', startedAt, ['load_timeout', 'preload_timeout', 'init_timeout', 'app_open_retry_paused'].includes(reason) ? reason : 'sdk_failed');
    return false;
  } finally {
    if (release) { appOpenShowing = false; if (presentationAttempted) void preloadAppOpenAd('after_presentation'); }
  }
}

/* ------------------------------------------------------------------ */
/* Stående banner längst ner under en match                            */
/* ------------------------------------------------------------------ */

/** Banner-ID per plattform. null = ingen banner i release-bygget än. */
export const BANNER_IDS: Record<'ios' | 'android', string | null> = {
  ios: 'ca-app-pub-7448540924654868/7786182090',
  android: 'ca-app-pub-7448540924654868/2816751438',
};

const GOOGLE_TEST_BANNER: Record<'ios' | 'android', string> = {
  ios: 'ca-app-pub-3940256099942544/2934735716',
  android: 'ca-app-pub-3940256099942544/6300978111',
};

let bannerWanted = false;
type BannerPlacement = 'game' | 'search';
let shownPlacement: BannerPlacement = 'game';
let parkedPlacement: BannerPlacement = 'game';
let bannerShown = false;
/** Hidden-but-loaded banner kept between matches (see hideGameBanner). */
let bannerParked = false;
// Command completion is not confirmation that Google supplied an ad.
let bannerLoaded = false;
let bannerFailed = false;
let bannerRequestAt = 0;
let bannerListeners: Promise<void> | null = null;
let bannerOperations: Promise<void> = Promise.resolve();
function queueBannerOperation(action: () => Promise<void>): Promise<void> {
  const next = bannerOperations.then(action);
  bannerOperations = next.catch(() => {});
  return next;
}
function reportBanner(result: string, reason?: string, extra: Record<string, unknown> = {}) {
  const metadata = {
    kind: 'banner', result, reason,
    ms: bannerRequestAt ? Date.now() - bannerRequestAt : 0,
    wanted: bannerWanted, commandVisible: bannerShown, loaded: bannerLoaded,
    parked: bannerParked, generation: bannerGen,
    route: typeof window !== 'undefined' ? window.location.pathname : null,
    foreground: typeof document !== 'undefined' ? document.visibilityState === 'visible' : null,
    testAd: ADMOB_CONFIG.useTestAds, ...extra,
  };
  void import('@/lib/analytics').then(({ trackEvent }) => trackEvent('ad_result', metadata)).catch(() => {});
}
/** One app-global listener set. SDK events have no banner/request ID. */
function ensureBannerListeners(mod: AdMobModule): Promise<void> {
  if (bannerListeners) return bannerListeners;
  bannerListeners = (async () => {
    const handles: Array<{ remove: () => Promise<void> }> = [];
    try {
      handles.push(await mod.AdMob.addListener(mod.BannerAdPluginEvents.Loaded, () => {
        bannerLoaded = true;
        bannerFailed = false;
        reportBanner('loaded');
      }));
      handles.push(await mod.AdMob.addListener(mod.BannerAdPluginEvents.FailedToLoad, (error) => {
        bannerLoaded = false;
        bannerFailed = true;
        reportBanner('load_failed', reasonOf(error), { code: error.code });
        // Both platforms destroy the native banner when loading fails.
        bannerShown = false;
        bannerParked = false;
        shownMargin = -1;
        parkedMargin = -1;
        clearTimeout(bannerParkTimer);
      }));
      handles.push(await mod.AdMob.addListener(mod.BannerAdPluginEvents.AdImpression, () => reportBanner('impression')));
      handles.push(await mod.AdMob.addListener(mod.BannerAdPluginEvents.SizeChanged, (size) => {
        // Lets fixed overlays (quick chat) stay above the real native banner height.
        try {
          document.documentElement.style.setProperty('--ad-banner-space', `${Math.max(0, shownMargin) + (size.height || 0)}px`);
        } catch { /* ignore */ }
        reportBanner('size_changed', undefined, { width: size.width, height: size.height });
      }));
      handles.push(await mod.AdMob.addListener(mod.BannerAdPluginEvents.Opened, () => reportBanner('opened')));
      handles.push(await mod.AdMob.addListener(mod.BannerAdPluginEvents.Closed, () => reportBanner('closed')));
    } catch (error) {
      await Promise.all(handles.map((handle) => handle.remove().catch(() => {})));
      bannerListeners = null;
      throw error;
    }
  })();
  return bannerListeners;
}
let parkedMargin = -1;
let bannerParkTimer: ReturnType<typeof setTimeout> | undefined;
const BANNER_PARK_MS = 30 * 60_000;
function scheduleParkedRemoval() {
  clearTimeout(bannerParkTimer);
  bannerParkTimer = setTimeout(() => {
    void queueBannerOperation(async () => {
      if (!bannerParked || bannerWanted) return;
      try {
        const mod = await loadModule();
        await mod.AdMob.removeBanner();
        bannerParked = false;
        bannerLoaded = false;
        reportBanner('removed');
      } catch (error) { reportBanner('remove_failed', reasonOf(error)); }
    });
  }, BANNER_PARK_MS);
}

/** Gör plats för bannern i spelets layout (se html.ad-banner-on i index.css). */
function setBannerSpace(on: boolean) {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('ad-banner-on', on);
  if (!on && typeof document !== 'undefined') resetBannerFit();
}

// Dev: ?bannerPreview=1 visar en låtsasbanner i förhandsvisningen.
const bannerPreview = typeof window !== 'undefined' && /[?&]bannerPreview=1/.test(window.location.search);
/** Bottenmarginal som centrerar bannern i ytan under protokollet. */
/** Avstånd mellan protokollets/knapparnas underkant och bannerns överkant. */
const BANNER_GAP_PX = 12;

/** Marginal nerifrån så bannern hamnar strax under protokollet och knapparna. */
function safeAreaBottom(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;height:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

/** Underkant av protokollet och av knapparna bredvid/under det, eller null. */
function gameEdges(): { board: number; buttons: number } | null {
  const zone = document.querySelector('.ios-score-zone');
  if (!zone) return null;
  const board = zone.getBoundingClientRect().bottom;
  let buttons = board;
  zone.parentElement?.querySelectorAll('button').forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.height > 0 && r.top < window.innerHeight) buttons = Math.max(buttons, r.bottom);
  });
  return { board, buttons };
}

/** Lägsta underkant av protokollet och knapparna i spelet, eller null. */
function gameContentBottom(): number | null {
  const e = gameEdges();
  return e ? Math.max(e.board, e.buttons) : null;
}

const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

/** Väntar tills spelbrickan finns och står still (onlinematcher laddas från servern). */
async function waitForStableGame(isStale: () => boolean, maxMs = 10_000) {
  const started = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - started < maxMs) {
    if (isStale()) return;
    await raf2();
    const b = gameContentBottom();
    if (b !== null && Math.abs(b - last) < 0.5) {
      if (++stable >= 4) return;
    } else stable = 0;
    last = b ?? -1;
  }
}

/** Tar bort krympningen som fitGameAboveBanner lagt på. */
function resetBannerFit() {
  const s = document.documentElement.style;
  s.removeProperty('--sb-row-h');
  s.removeProperty('--dice-scale');
  s.removeProperty('--dice-gap-scale');
}

/**
 * Krymper protokollrader och tärningar tills allt får plats ovanför bannern,
 * och krymper tärningarna tills Hem/Ge upp slutar i linje med brickan.
 * Mäts på den riktiga skärmen (inkl. statusfält och hemindikator), så inget
 * kan hamna under annonsen oavsett telefon.
 */
async function fitGameAboveBanner(isStale: () => boolean) {
  await waitForStableGame(isStale);
  if (isStale()) return;
  resetBannerFit();
  await raf2();
  const root = document.documentElement;
  const css = getComputedStyle(root);
  let row = parseFloat(css.getPropertyValue('--sb-row-h')) || 34;
  let dice = parseFloat(css.getPropertyValue('--dice-scale')) || 1;
  let gapS = parseFloat(css.getPropertyValue('--dice-gap-scale')) || dice;
  for (let i = 0; i < 14; i++) {
    if (isStale()) return;
    const e = gameEdges();
    if (!e) return;
    const bottom = Math.max(e.board, e.buttons);
    const limit = window.innerHeight - safeAreaBottom() - 50 - BANNER_GAP_PX;
    const over = bottom - limit;
    const mis = e.buttons - e.board; // knapparna under brickans nederkant
    if (over <= 0.5 && Math.abs(mis) <= 1) return;
    if (over <= 0.5 && mis < -1) return; // knapparna ovanför brickan styrs av CSS (stretch)
    const sideOver = Math.max(e.buttons - limit, mis); // hur mycket sidokolumnen ska kortas
    if (e.board - limit > 0.5) {
      // Själva brickan räcker under annonsen: kortare rader.
      row = Math.max(20, Math.floor((row - (e.board - limit) / 19 - 0.25) * 2) / 2);
    }
    if (sideOver > 1 && dice > 0.45) {
      // Sidokolumnen (tärningar + Kasta + Hem/Ge upp) är för lång: mindre tärningar.
      const k = Math.max(0.85, 1 - sideOver / Math.max(1, e.buttons - 250));
      dice = Math.max(0.45, +(dice * k).toFixed(3));
      gapS = Math.max(0.3, +(gapS * k).toFixed(3));
    } else if (mis > 1 && e.buttons <= limit + 0.5) {
      // Tärningarna kan inte bli mindre: förläng brickan ner till knapparna.
      row = Math.floor((row + mis / 19) * 2) / 2;
    } else if (e.board - limit <= 0.5) {
      return;
    }
    root.style.setProperty('--sb-row-h', `${row}px`);
    root.style.setProperty('--dice-scale', String(dice));
    root.style.setProperty('--dice-gap-scale', String(gapS));
    await raf2();
    await raf2();
  }
}

function measureBannerMargin(): number | null {
  const zone = document.querySelector('.ios-score-zone');
  if (!zone) return null;
  // Lägsta underkanten av protokollet och knapparna bredvid/under det.
  let bottom = zone.getBoundingClientRect().bottom;
  zone.parentElement?.querySelectorAll('button').forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.height > 0 && r.top < window.innerHeight) bottom = Math.max(bottom, r.bottom);
  });
  // Pluginet räknar marginalen från safe area-kanten: ovanför hemindikatorn på
  // iOS och ovanför navigationsfältet på Android 15+.
  const free = window.innerHeight - safeAreaBottom() - bottom;
  return Math.max(0, Math.round(free - 50 - BANNER_GAP_PX));
}

/** Mäter så fort layouten står still (intro-animationen klar), max 600 ms. */
async function centeredBannerMargin(): Promise<number> {
  const started = Date.now();
  let last: number | null = null;
  let stable = 0;
  while (Date.now() - started < 600) {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const m = measureBannerMargin();
    if (m !== null && m === last) {
      if (++stable >= 3) return m; // samma värde 3 bildrutor i rad
    } else stable = 0;
    last = m;
  }
  return last ?? 0;
}

let shownMargin = -1;
let bannerRemoving: Promise<void> = Promise.resolve();

async function searchBannerMargin(): Promise<number | null> {
  await raf2();
  const slot = document.querySelector('[data-search-ad-slot]')?.getBoundingClientRect();
  if (!slot || slot.width < 300 || slot.top < 0 || slot.bottom > window.innerHeight - safeAreaBottom() + 1) return null;
  return Math.max(0, Math.round(window.innerHeight - safeAreaBottom() - slot.bottom));
}

async function previewBanner(on: boolean, isStale: () => boolean = () => false, placement: BannerPlacement = 'game') {
  const id = 'ad-banner-preview';
  document.getElementById(id)?.remove();
  setBannerSpace(on && placement === 'game');
  if (!on) return;
  if (placement === 'game') await fitGameAboveBanner(isStale);
  if (isStale()) return;
  const d = document.createElement('div');
  d.id = id;
  d.textContent = placement === 'search' ? 'Annons · 300×250' : 'Annons · 320×50';
  d.className = 'ad-banner-preview';
  d.style.width = placement === 'search' ? '300px' : '320px';
  d.style.height = placement === 'search' ? '250px' : '50px';
  const margin = placement === 'search' ? await searchBannerMargin() : await centeredBannerMargin();
  if (margin === null) return;
  if (isStale()) return; // sidan lämnades medan vi mätte
  document.getElementById(id)?.remove();
  d.style.bottom = `${margin + (placement === 'search' ? safeAreaBottom() : 0)}px`;
  document.body.appendChild(d);
}

function bannerUnitId(): string | null {
  const p = adPlatform();
  if (!p || !ADMOB_IDS[p].appId) return null;
  if (ADMOB_CONFIG.useTestAds) return GOOGLE_TEST_BANNER[p];
  return BANNER_IDS[p];
}

/** Visar bannern längst ner. Kastar aldrig. */
let bannerGen = 0;

export async function showGameBanner(placement: BannerPlacement = 'game'): Promise<void> {
  bannerWanted = true;
  shownPlacement = placement;
  if (privacyChanging || privacyBlocked) return;
  // Varje sidbyte får ett eget nummer; ett äldre anrop som fortfarande väntar
  // avbryts, så att två sidor aldrig visar varsin banner.
  const gen = ++bannerGen;
  const stale = () => !bannerWanted || gen !== bannerGen || privacyChanging || privacyBlocked;
  return queueBannerOperation(() => showBannerForScreen(stale, placement));
}

async function showBannerForScreen(stale: () => boolean, placement: BannerPlacement): Promise<void> {
  if (stale()) return;
  if (bannerPreview) { await previewBanner(true, stale, placement); return; }
  const adId = bannerUnitId();
  if (!isAdMobAvailable() || !adId) {
    if (Capacitor.isNativePlatform()) reportBanner('unavailable', !adId ? 'missing_unit_id' : 'plugin_unavailable');
    return;
  }
  try {
    const mod = await initWithTimeout(PREPARE_TIMEOUT_MS);
    if (stale()) return;
    await ensureBannerListeners(mod);
    if (stale()) return;
    setBannerSpace(placement === 'game');
    if (placement === 'game') await fitGameAboveBanner(stale);
    if (stale()) return;
    const margin = placement === 'search' ? await searchBannerMargin() : await centeredBannerMargin();
    if (margin === null) {
      if (bannerShown) {
        await mod.AdMob.hideBanner();
        bannerShown = false;
        bannerParked = true;
        parkedMargin = shownMargin;
        parkedPlacement = shownPlacement;
        scheduleParkedRemoval();
      }
      return;
    }
    // Vänta tills en pågående borttagning är klar, så den inte tar bort nya bannern.
    await bannerRemoving.catch(() => {});
    if (stale()) { if (!bannerWanted) setBannerSpace(false); return; }
    // Samma plats som nu: låt bannern ligga kvar i stället för att ladda om den.
    if (bannerShown && placement === shownPlacement && margin === shownMargin && !bannerFailed) { reportBanner('kept'); return; }
    // Parked (hidden, still loaded) banner at the same spot: resume instantly
    // instead of loading a new one — e.g. between matches.
    if (bannerParked) {
      clearTimeout(bannerParkTimer);
      bannerParked = false;
      if (placement === parkedPlacement && margin === parkedMargin && !bannerFailed) {
        reportBanner('resume_requested', undefined, { margin });
        try {
          await mod.AdMob.resumeBanner();
          if (!bannerFailed) {
            if (stale()) { await mod.AdMob.hideBanner(); if (bannerFailed) return; bannerParked = true; reportBanner('hidden'); scheduleParkedRemoval(); return; }
            bannerShown = true;
            shownMargin = margin;
            shownPlacement = placement;
            setBannerSpace(placement === 'game');
            reportBanner('resumed', undefined, { margin });
            return;
          }
        } catch (error) {
          // Reload a lost native view in this match, not after another navigation.
          bannerFailed = true;
          reportBanner('resume_failed', reasonOf(error), { margin });
        }
      }
      await mod.AdMob.removeBanner();
      bannerLoaded = false;
      reportBanner('removed');
      if (stale()) { if (!bannerWanted) setBannerSpace(false); return; }
    }
    // Ny skärm med annan höjd: visa om med ny marginal.
    if (bannerShown) { await mod.AdMob.removeBanner(); bannerShown = false; bannerLoaded = false; reportBanner('removed'); }
    bannerFailed = false;
    bannerRequestAt = Date.now();
    reportBanner('load_requested', undefined, { margin });
    await mod.AdMob.showBanner({
      adId,
      adSize: placement === 'search' ? mod.BannerAdSize.MEDIUM_RECTANGLE : mod.BannerAdSize.BANNER,
      position: mod.BannerAdPosition.BOTTOM_CENTER,
      margin,
      isTesting: ADMOB_CONFIG.useTestAds,
    });
    reportBanner('show_command_completed', undefined, { margin });
    if (bannerFailed) return;
    bannerShown = true;
    shownMargin = margin;
    shownPlacement = placement;
    setBannerSpace(bannerWanted && placement === 'game');
    if (stale()) {
      await mod.AdMob.hideBanner();
      bannerShown = false;
      if (bannerFailed) return;
      bannerParked = true;
      parkedMargin = margin;
      parkedPlacement = placement;
      reportBanner('hidden');
      scheduleParkedRemoval();
    }
  } catch (err) {
    setBannerSpace(false);
    bannerShown = false;
    bannerParked = false;
    bannerLoaded = false;
    bannerFailed = true;
    reportBanner('failed', reasonOf(err));
  }
}

/** Döljer bannern (t.ex. när matchen lämnas eller en helskärmsannons visas). */
export async function hideGameBanner(): Promise<void> {
  bannerWanted = false;
  bannerGen++;
  setBannerSpace(false);
  if (bannerPreview) { void previewBanner(false); return; }
  return queueBannerOperation(hideBannerForScreen);
}

async function hideBannerForScreen(): Promise<void> {
  if (bannerWanted) return; // a newer screen requested the banner
  if (!bannerShown || !isAdMobAvailable()) return;
  // Markera direkt som borta: annars kan en ny match som öppnas medan
  // borttagningen pågår tro att bannern ligger kvar och hoppa över visningen.
  const parkAt = shownMargin;
  bannerShown = false;
  shownMargin = -1;
  bannerRemoving = (async () => {
    try {
      const mod = await loadModule();
      // Hide (keep loaded) so the next match can resume it instantly; a parked
      // banner is fully removed after BANNER_PARK_MS so no stale one lingers.
      await mod.AdMob.hideBanner();
      if (bannerFailed) return;
      bannerParked = true;
      parkedMargin = parkAt;
      parkedPlacement = shownPlacement;
      reportBanner('hidden');
      scheduleParkedRemoval();
    } catch (error) {
      reportBanner('hide_failed', reasonOf(error));
      try {
        const mod = await loadModule(); await mod.AdMob.removeBanner();
        bannerLoaded = false;
        reportBanner('removed');
      } catch (removeError) { reportBanner('remove_failed', reasonOf(removeError)); }
      bannerParked = false;
    }
  })();
  await bannerRemoving;
}
