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
        return true;
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
export async function showAppOpenAd(canShow: () => boolean = () => true): Promise<boolean> {
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
    // Loaded too late (player already left the start screen): never cover a game.
    if (!canShow()) { reportAd('appOpen', 'skipped_left_home', startedAt); return false; }
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
let bannerShown = false;

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

/** Lägsta underkant av protokollet och knapparna i spelet, eller null. */
function gameContentBottom(): number | null {
  const zone = document.querySelector('.ios-score-zone');
  if (!zone) return null;
  let bottom = zone.getBoundingClientRect().bottom;
  zone.parentElement?.querySelectorAll('button').forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.height > 0 && r.top < window.innerHeight) bottom = Math.max(bottom, r.bottom);
  });
  return bottom;
}

const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

/** Tar bort krympningen som fitGameAboveBanner lagt på. */
function resetBannerFit() {
  const s = document.documentElement.style;
  s.removeProperty('--sb-row-h');
  s.removeProperty('--dice-scale');
  s.removeProperty('--dice-gap-scale');
}

/**
 * Krymper protokollrader och tärningar tills allt får plats ovanför bannern.
 * Mäts på den riktiga skärmen (inkl. statusfält och hemindikator), så inget
 * kan hamna under annonsen oavsett telefon.
 */
async function fitGameAboveBanner(isStale: () => boolean) {
  resetBannerFit();
  await raf2();
  const root = document.documentElement;
  const css = getComputedStyle(root);
  let row = parseFloat(css.getPropertyValue('--sb-row-h')) || 34;
  let dice = parseFloat(css.getPropertyValue('--dice-scale')) || 1;
  let gapS = parseFloat(css.getPropertyValue('--dice-gap-scale')) || dice;
  for (let i = 0; i < 8; i++) {
    if (isStale()) return;
    const bottom = gameContentBottom();
    if (bottom === null) return;
    const limit = window.innerHeight - safeAreaBottom() - 50 - BANNER_GAP_PX;
    const over = bottom - limit;
    if (over <= 0.5) return;
    // Protokollet har ~20 rader; tärningskolumnen ~5 tärningar + 4 mellanrum.
    const k = Math.max(0.8, 1 - over / Math.max(1, bottom - 120));
    row = Math.max(20, Math.floor((row - over / 19 - 0.25) * 2) / 2);
    dice = Math.max(0.5, +(dice * k).toFixed(3));
    gapS = Math.max(0.3, +(gapS * k).toFixed(3));
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

async function previewBanner(on: boolean, isStale: () => boolean = () => false) {
  const id = 'ad-banner-preview';
  document.getElementById(id)?.remove();
  setBannerSpace(on);
  if (!on) return;
  await fitGameAboveBanner(isStale);
  if (isStale()) return;
  const d = document.createElement('div');
  d.id = id;
  d.textContent = 'Annons · 320×50';
  d.style.cssText = 'position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:320px;height:50px;background:#fff;color:#333;display:flex;align-items:center;justify-content:center;font:12px sans-serif;z-index:2147483646';
  const margin = await centeredBannerMargin();
  if (isStale()) return; // sidan lämnades medan vi mätte
  document.getElementById(id)?.remove();
  d.style.bottom = `${margin}px`;
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

export async function showGameBanner(): Promise<void> {
  bannerWanted = true;
  // Varje sidbyte får ett eget nummer; ett äldre anrop som fortfarande väntar
  // avbryts, så att två sidor aldrig visar varsin banner.
  const gen = ++bannerGen;
  const stale = () => !bannerWanted || gen !== bannerGen;
  if (bannerPreview) { await previewBanner(true, stale); return; }
  const adId = bannerUnitId();
  if (!isAdMobAvailable() || !adId) return;
  try {
    const mod = await withTimeout(ensureInitialized(), PREPARE_TIMEOUT_MS, 'init');
    if (stale()) return;
    setBannerSpace(true);
    await fitGameAboveBanner(stale);
    if (stale()) return;
    const margin = await centeredBannerMargin();
    // Vänta tills en pågående borttagning är klar, så den inte tar bort nya bannern.
    await bannerRemoving.catch(() => {});
    if (stale()) { if (!bannerWanted) setBannerSpace(false); return; }
    // Samma plats som nu: låt bannern ligga kvar i stället för att ladda om den.
    if (bannerShown && margin === shownMargin) return;
    // Ny skärm med annan höjd: visa om med ny marginal.
    if (bannerShown) { await mod.AdMob.removeBanner().catch(() => {}); bannerShown = false; }
    await mod.AdMob.showBanner({
      adId,
      adSize: mod.BannerAdSize.BANNER, // AdMob standard 320×50
      position: mod.BannerAdPosition.BOTTOM_CENTER,
      margin,
      isTesting: ADMOB_CONFIG.useTestAds,
    });
    bannerShown = true;
    shownMargin = margin;
    setBannerSpace(bannerWanted);
    if (!bannerWanted) { await mod.AdMob.removeBanner().catch(() => {}); bannerShown = false; }
  } catch (err) {
    setBannerSpace(false);
    reportAd('banner', 'failed', Date.now(), reasonOf(err));
  }
}

/** Döljer bannern (t.ex. när matchen lämnas eller en helskärmsannons visas). */
export async function hideGameBanner(): Promise<void> {
  bannerWanted = false;
  bannerGen++;
  setBannerSpace(false);
  if (bannerPreview) { void previewBanner(false); return; }
  if (!bannerShown || !isAdMobAvailable()) return;
  // Markera direkt som borta: annars kan en ny match som öppnas medan
  // borttagningen pågår tro att bannern ligger kvar och hoppa över visningen.
  bannerShown = false;
  shownMargin = -1;
  bannerRemoving = (async () => {
    try {
      const mod = await loadModule();
      // Ta bort helt (inte bara dölj) så att ingen gammal banner ligger kvar.
      await mod.AdMob.removeBanner();
    } catch { /* best effort */ }
  })();
  await bannerRemoving;
}
