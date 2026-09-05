/**
 * Google AdMob interstitial integration.
 *
 * HUVUDREGEL: en annons får ENDAST visas efter att användaren aktivt tryckt på
 * knappen "Frivillig reklam". Ingen automatisk visning vid appstart, mellan
 * matcher, vid navigation, efter timeout eller efter preload.
 *
 * showOptionalInterstitial() är den ENDA funktionen som anropar show().
 */
import { Capacitor } from '@capacitor/core';

/* ------------------------------------------------------------------ */
/* Central konfiguration                                               */
/* ------------------------------------------------------------------ */

/** Googles officiella test-ID (används i development). */
const TEST_INTERSTITIAL_AD_UNIT_ID_IOS = 'ca-app-pub-3940256099942544/4411468910';

export const ADMOB_CONFIG = {
  /** iOS App ID – sätts i Info.plist som GADApplicationIdentifier. */
  appIdIOS: 'ca-app-pub-7448540924654868~6494873071',
  /** Produktions-ad unit ID för interstitial (iOS). */
  interstitialAdUnitIdIOS: 'ca-app-pub-7448540924654868/6422685490',
  /** Test-annonser i dev, riktiga annonser i release-bygget. */
  useTestAds: import.meta.env.DEV,
} as const;

function interstitialAdId(): string {
  return ADMOB_CONFIG.useTestAds
    ? TEST_INTERSTITIAL_AD_UNIT_ID_IOS
    : ADMOB_CONFIG.interstitialAdUnitIdIOS;
}

/** AdMob finns bara på native-plattform (iOS). */
export function isAdMobAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

type AdMobModule = typeof import('@capacitor-community/admob');

let modulePromise: Promise<AdMobModule> | null = null;
let initialized = false;
let preparedAt = 0;
let preparing: Promise<boolean> | null = null;
let showing = false;
let dismissListenerAttached = false;

const PREPARED_TTL_MS = 45 * 60 * 1000; // AdMob-annonser blir inaktuella efter ~1h

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
  if (!isAdMobAvailable()) return false;
  if (preparing) return preparing;
  if (preparedAt && Date.now() - preparedAt < PREPARED_TTL_MS) return true;

  preparing = (async () => {
    try {
      const mod = await ensureInitialized();
      await mod.AdMob.prepareInterstitial({
        adId: interstitialAdId(),
        isTesting: ADMOB_CONFIG.useTestAds,
      });
      preparedAt = Date.now();
      return true;
    } catch {
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
  try {
    const ready = await preloadInterstitial();
    if (!ready) {
      showing = false;
      return 'failed';
    }
    const mod = await loadModule();
    await mod.AdMob.showInterstitial();
    preparedAt = 0; // förbrukad – laddas om via Dismissed-lyssnaren
    void preloadInterstitial();
    return 'shown';
  } catch {
    preparedAt = 0;
    return 'failed';
  } finally {
    showing = false;
  }
}
