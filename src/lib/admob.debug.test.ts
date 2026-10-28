import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ platform: 'ios', handlers: new Map<string, Set<() => void>>(), show: vi.fn(async () => {}), showRewarded: vi.fn(async () => ({})), prepareRewarded: vi.fn(async () => ({})), banner: { show: vi.fn(async () => {}), hide: vi.fn(async () => {}), resume: vi.fn(async () => {}), remove: vi.fn(async () => {}) }, loadAppOpen: vi.fn(async () => {}), appOpenLoaded: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => native.platform, isNativePlatform: () => true, isPluginAvailable: () => true,
} }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  InterstitialAdPluginEvents: { Dismissed: 'dismissed', FailedToShow: 'failed' },
  BannerAdSize: { BANNER: 'BANNER', MEDIUM_RECTANGLE: 'MEDIUM_RECTANGLE' }, BannerAdPosition: { BOTTOM_CENTER: 'BOTTOM_CENTER' },
  BannerAdPluginEvents: { Loaded: 'b_loaded', FailedToLoad: 'b_failed', AdImpression: 'b_impression', SizeChanged: 'b_size', Opened: 'b_opened', Closed: 'b_closed' },
  RewardAdPluginEvents: { Showed: 'r_showed', Rewarded: 'r_reward', Dismissed: 'r_dismissed', FailedToShow: 'r_failed' },
  AdMob: {
    requestConsentInfo: async () => ({ canRequestAds: true }),
    initialize: async () => {}, prepareInterstitial: async () => {}, showInterstitial: native.show,
    prepareRewardVideoAd: native.prepareRewarded, showRewardVideoAd: native.showRewarded,
    isAppOpenLoaded: async () => ({ value: native.appOpenLoaded }),
    loadAppOpen: async () => { await native.loadAppOpen(); native.appOpenLoaded = true; },
    showAppOpen: async () => {},
    showBanner: native.banner.show, hideBanner: native.banner.hide, resumeBanner: native.banner.resume, removeBanner: native.banner.remove,
    addListener: async (event: string, handler: () => void) => {
      const handlers = native.handlers.get(event) ?? new Set();
      handlers.add(handler);
      native.handlers.set(event, handlers);
      return { remove: async () => { handlers.delete(handler); } };
    },
  },
}));

async function setup() {
  const { recordGameResult, getRankedGames } = await import('./local-stats');
  recordGameResult(200, true, 0, 'first-match');
  console.log('ranked =', getRankedGames());
  return import('./admob');
}

describe('debug', () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); native.platform = 'ios';
    native.loadAppOpen.mockClear(); native.appOpenLoaded = false;
    localStorage.clear();
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('plain flow reaches load', async () => {
    const m = await setup();
    const r = await m.showAppOpenAd();
    console.log('plain result =', r, 'calls =', native.loadAppOpen.mock.calls.length);
    expect(r).toBe(true);
  });

  it('stalled load gives up after 12 s', async () => {
    native.loadAppOpen.mockImplementationOnce(() => new Promise<void>(() => {}));
    const m = await setup();
    let result: boolean | undefined;
    void m.showAppOpenAd().then((shown) => { result = shown; });
    await vi.advanceTimersByTimeAsync(8_000);
    console.log('at 8 s  result =', result, 'calls =', native.loadAppOpen.mock.calls.length);
    await vi.advanceTimersByTimeAsync(4_000);
    console.log('at 12 s result =', result, 'calls =', native.loadAppOpen.mock.calls.length);
    expect(result).toBe(false);
  });
});
