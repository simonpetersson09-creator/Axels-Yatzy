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
function reportAd(kind: 'appOpen' | 'optional', result: string, startedAt: number, reason?: string) {
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

async function ensureInitialized(): Promise<AdMobModule> {
  const mod = await loadModule();
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
      const mod = await ensureInitialized();
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
  try {
    const ready = await preloadInterstitial();
    if (!ready) {
      showing = false;
      reportAd('optional', 'load_failed', startedAt, lastPrepareError);
      return 'failed';
    }
    const mod = await loadModule();
    await withTimeout(mod.AdMob.showInterstitial(), SHOW_TIMEOUT_MS, 'show');
    preparedAt = 0; // förbrukad – laddas om via Dismissed-lyssnaren
    reportAd('optional', 'shown', startedAt);
    void preloadInterstitial();
    return 'shown';
  } catch (err) {
    preparedAt = 0;
    reportAd('optional', 'show_failed', startedAt, reasonOf(err));
    return 'failed';
  } finally {
    showing = false;
  }
}

/* ------------------------------------------------------------------ */
/* App Open-annons (automatisk startannons; plattform med eget ID)    */
/* Helt separat från interstitial-flödet för "Frivillig reklam".       */
/* ------------------------------------------------------------------ */

/** Laddas annonsen inte inom denna tid visas den inte alls denna start. */
const APP_OPEN_LOAD_TIMEOUT_MS = 8000;

let appOpenShowing = false;

/**
 * Laddar och visar en App Open-annons vid appstart. Returnerar true om den
 * visades. Kastar aldrig; misslyckas tyst så att appen fortsätter direkt.
 */
export async function showAppOpenAd(): Promise<boolean> {
  const adId = adUnitId('appOpen');
  if (!isAdMobAvailable() || !adId) return false;
  if (appOpenShowing || showing) return false;
  appOpenShowing = true;
  const startedAt = Date.now();
  try {
    const mod = await withTimeout(ensureInitialized(), APP_OPEN_LOAD_TIMEOUT_MS, 'init');
    await withTimeout(mod.AdMob.loadAppOpen({ adId }), APP_OPEN_LOAD_TIMEOUT_MS, 'load');
    const { value } = await mod.AdMob.isAppOpenLoaded();
    if (!value) { reportAd('appOpen', 'not_loaded', startedAt); return false; }
    await withTimeout(mod.AdMob.showAppOpen(), SHOW_TIMEOUT_MS, 'show');
    reportAd('appOpen', 'shown', startedAt);
    return true;
  } catch (err) {
    reportAd('appOpen', 'failed', startedAt, reasonOf(err));
    return false;
  } finally {
    appOpenShowing = false;
  }
}
