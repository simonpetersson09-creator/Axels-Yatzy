/**
 * Google AdMob interstitial integration.
 *
 * HUVUDREGEL: en annons får ENDAST visas efter att användaren aktivt tryckt på
 * knappen "Frivillig reklam". Ingen automatisk visning vid appstart, mellan
 * matcher, vid navigation, efter timeout eller efter preload.
 *
 * showOptionalInterstitial() är den ENDA funktionen som visar interstitials.
 * Undantag: showAppOpenAd() visar en App Open-annons vid start, max 1 gång/dag.
 */
import { Capacitor } from '@capacitor/core';

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
let initialized = false;
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

/** Silent diagnostics so failing ads (e.g. on iPad) show up in analytics. */
function reportAd(kind: 'appOpen' | 'optional' | 'banner', result: string, startedAt: number, reason?: string) {
  void import('@/lib/analytics').then(({ trackEvent }) =>
    trackEvent('ad_result', {
      kind,
      result,
      reason,
      ms: Date.now() - startedAt,
      ipad: typeof navigator !== 'undefined' && /iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1,
    }),
  ).catch(() => {});
}

const PREPARE_TIMEOUT_MS = 10_000;
const SHOW_TIMEOUT_MS = 8_000;

async function loadModule(): Promise<AdMobModule> {
  if (!modulePromise) modulePromise = import('@capacitor-community/admob');
  return modulePromise;
}

let consentPromise: Promise<boolean> | null = null;
let privacyOptionsRequired = false;

/**
 * Googles samtyckesruta (UMP) – visas bara där den krävs (EU/UK) och bara
 * tills spelaren svarat. Returnerar om annonser får begäras.
 * Fel i samtyckesflödet blockerar inte spelet; Google avgör då själv.
 */
function ensureConsent(mod: AdMobModule): Promise<boolean> {
  if (!consentPromise) {
    consentPromise = (async () => {
      try {
        let info = await withTimeout(mod.AdMob.requestConsentInfo(), 10_000, 'consent_info');
        if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) {
          info = await mod.AdMob.showConsentForm();
        }
        privacyOptionsRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
        return info.canRequestAds;
      } catch (err) {
        console.warn('[AdMob] consent flow failed', err);
        consentPromise = null; // försök igen nästa gång
        // Inget samtycke inhämtat: visa inga annonser alls denna gång (EU-krav).
        return false;
      }
    })();
  }
  return consentPromise;
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

/** Öppnar Googles ruta så spelaren kan ändra sitt annonsval. */
export async function showAdPrivacyOptions(): Promise<void> {
  if (!isAdMobAvailable()) return;
  try {
    const mod = await loadModule();
    await mod.AdMob.showPrivacyOptionsForm();
  } catch (err) {
    console.warn('[AdMob] privacy options failed', err);
  }
}

async function ensureInitialized(): Promise<AdMobModule> {
  const mod = await loadModule();
  // Samtycke först: inga annonser begärs innan spelaren svarat i EU.
  const canRequest = await ensureConsent(mod);
  if (!canRequest) throw new Error('consent_not_given');
  if (!initialized) {
    // Ingen ATT-popup: vi begär aldrig tracking-authorization automatiskt.
    await mod.AdMob.initialize({
      initializeForTesting: ADMOB_CONFIG.useTestAds,
    });
    initialized = true;
  }
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
  if (!isAdMobAvailable() || !adUnitId('optional')) return false;
  if (preparing) return preparing;
  if (preparedAt && Date.now() - preparedAt < PREPARED_TTL_MS) return true;

  preparing = (async () => {
    try {
      const mod = await withTimeout(ensureInitialized(), PREPARE_TIMEOUT_MS, 'init');
      const adId = adUnitId('optional');
      if (!adId) return false;
      await withTimeout(mod.AdMob.prepareInterstitial({
        adId,
        isTesting: ADMOB_CONFIG.useTestAds,
      }), PREPARE_TIMEOUT_MS, 'prepare');
      preparedAt = Date.now();
      return true;
    } catch (err) {
      lastPrepareError = reasonOf(err);
      preparedAt = 0;
      return false;
    } finally {
      preparing = null;
    }
  })();

  return preparing;
}

export type ShowAdResult = 'shown' | 'unavailable' | 'failed' | 'busy';

/**
 * Visar en interstitial. Får ENDAST anropas direkt från användarens tryck på
 * knappen "Frivillig reklam". Ger ingen reward eller spelmässig fördel.
 */
export async function showOptionalInterstitial(): Promise<ShowAdResult> {
  if (!isAdMobAvailable()) return 'unavailable';
  if (showing) return 'busy';
  showing = true;
  const startedAt = Date.now();
  const listeners: Awaited<ReturnType<AdMobModule['AdMob']['addListener']>>[] = [];
  try {
    const ready = await preloadInterstitial();
    if (!ready) {
      showing = false;
      reportAd('optional', 'load_failed', startedAt, lastPrepareError);
      return 'failed';
    }
    const mod = await loadModule();
    // Native presentation resolves immediately; XP must wait until dismissal.
    let settle: (result: ShowAdResult) => void = () => {};
    const closed = new Promise<ShowAdResult>((resolve) => { settle = resolve; });
    listeners.push(await mod.AdMob.addListener(mod.InterstitialAdPluginEvents.Dismissed, () => settle('shown')));
    listeners.push(await mod.AdMob.addListener(mod.InterstitialAdPluginEvents.FailedToShow, () => settle('failed')));
    await withTimeout(mod.AdMob.showInterstitial(), SHOW_TIMEOUT_MS, 'show');
    const result = await closed;
    preparedAt = 0; // förbrukad – laddas om via Dismissed-lyssnaren
    reportAd('optional', result === 'shown' ? 'shown' : 'show_failed', startedAt);
    if (result === 'shown') void preloadInterstitial();
    return result;
  } catch (err) {
    preparedAt = 0;
    reportAd('optional', 'show_failed', startedAt, reasonOf(err));
    return 'failed';
  } finally {
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
/** Start ad stays away this long after the rewarded ad closes. */
const APP_OPEN_SUPPRESS_AFTER_REWARDED_MS = 2 * 60_000;

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
  const adId = rewardedUnitId();
  if (!isAdMobAvailable() || !adId) return false;
  if (rewardedPreparing) return rewardedPreparing;
  if (rewardedPreparedAt && Date.now() - rewardedPreparedAt < PREPARED_TTL_MS) return true;
  rewardedPreparing = (async () => {
    try {
      const loadMs = adPlatform() === 'android' ? ANDROID_REWARDED_LOAD_TIMEOUT_MS : PREPARE_TIMEOUT_MS;
      const mod = await withTimeout(ensureInitialized(), loadMs, 'init');
      await withTimeout(mod.AdMob.prepareRewardVideoAd({ adId, isTesting: ADMOB_CONFIG.useTestAds }), loadMs, 'prepare');
      rewardedPreparedAt = Date.now();
      return true;
    } catch (err) {
      lastPrepareError = reasonOf(err);
      rewardedPreparedAt = 0;
      return false;
    } finally {
      rewardedPreparing = null;
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
let lateRewardListenerAttached = false;
async function ensureLateRewardListener(mod: AdMobModule) {
  if (lateRewardListenerAttached) return;
  lateRewardListenerAttached = true;
  await onReward(mod)(mod.RewardAdPluginEvents.Rewarded, (ev: RewardEvent) => {
    const aid = ev?.attemptId;
    if (aid && closedUnrewarded.delete(aid)) lateRewardHandler?.();
  });
}
function rememberUnrewarded(aid: string) {
  closedUnrewarded.add(aid);
  if (closedUnrewarded.size > 20) closedUnrewarded.delete(closedUnrewarded.values().next().value as string);
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
export async function showOptionalRewarded(): Promise<RewardedResult> {
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
          if (!earned) rememberUnrewarded(nativeId);
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

    const first = await Promise.race([lifecycle, openTimeout]);
    if (first !== 'open_timeout') {
      release();
      reportAd('optional', first, startedAt);
      return first;
    }
    reportAd('optional', 'open_timeout', startedAt);
    void lifecycle.then((late) => {
      release();
      reportAd('optional', `late_${late}`, startedAt);
      if (late === 'rewarded') lateRewardHandler?.();
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

/** Laddas annonsen inte inom denna tid visas den inte alls denna start. */
const APP_OPEN_LOAD_TIMEOUT_MS = 8000;

let appOpenShowing = false;
let appOpenPreload: Promise<boolean> | null = null;

/** Laddar nästa App Open-annons i förväg så den kan visas direkt vid nästa start. */
export function preloadAppOpenAd(): Promise<boolean> {
  const adId = adUnitId('appOpen');
  if (!isAdMobAvailable() || !adId) return Promise.resolve(false);
  if (appOpenPreload) return appOpenPreload;
  appOpenPreload = (async () => {
    try {
      const mod = await withTimeout(ensureInitialized(), PREPARE_TIMEOUT_MS, 'init');
      const { value } = await mod.AdMob.isAppOpenLoaded();
      if (value) return true;
      await withTimeout(mod.AdMob.loadAppOpen({ adId }), 20_000, 'load');
      return (await mod.AdMob.isAppOpenLoaded()).value;
    } catch {
      return false;
    } finally {
      appOpenPreload = null;
    }
  })();
  return appOpenPreload;
}

/**
 * Laddar och visar en App Open-annons vid appstart. Returnerar true om den
 * visades. Kastar aldrig; misslyckas tyst så att appen fortsätter direkt.
 */
export async function showAppOpenAd(canShow: () => boolean = () => true): Promise<boolean> {
  const adId = adUnitId('appOpen');
  if (!isAdMobAvailable() || !adId) return false;
  if (appOpenShowing || showing || rewardedShowing) return false;
  // Never show the start ad right after the player returns from the rewarded ad.
  if (Date.now() < suppressAppOpenUntil) return false;
  appOpenShowing = true;
  const startedAt = Date.now();
  let release = true;
  try {
    const mod = await withTimeout(ensureInitialized(), APP_OPEN_LOAD_TIMEOUT_MS, 'init');
    // A preload already running (started at cold start) is awaited, not doubled.
    if (appOpenPreload) await withTimeout(appOpenPreload, APP_OPEN_LOAD_TIMEOUT_MS, 'preload').catch(() => {});
    const pre = await mod.AdMob.isAppOpenLoaded();
    if (!pre.value) await withTimeout(mod.AdMob.loadAppOpen({ adId }), APP_OPEN_LOAD_TIMEOUT_MS, 'load');
    const { value } = await mod.AdMob.isAppOpenLoaded();
    if (!value) { reportAd('appOpen', 'not_loaded', startedAt); return false; }
    // Loaded too late (player already left the start screen): never cover a game.
    if (!canShow()) { reportAd('appOpen', 'skipped_left_home', startedAt); return false; }
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
      ).finally(() => { appOpenShowing = false; void preloadAppOpenAd(); });
      return true;
    }
    return true;
  } catch (err) {
    reportAd('appOpen', 'failed', startedAt, reasonOf(err));
    return false;
  } finally {
    if (release) { appOpenShowing = false; void preloadAppOpenAd(); }
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
      handles.push(await mod.AdMob.addListener(mod.BannerAdPluginEvents.SizeChanged, (size) =>
        reportBanner('size_changed', undefined, { width: size.width, height: size.height })));
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
  // Varje sidbyte får ett eget nummer; ett äldre anrop som fortfarande väntar
  // avbryts, så att två sidor aldrig visar varsin banner.
  const gen = ++bannerGen;
  const stale = () => !bannerWanted || gen !== bannerGen;
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
    const mod = await withTimeout(ensureInitialized(), PREPARE_TIMEOUT_MS, 'init');
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
