import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

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

describe('debug slow load', () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); native.platform = 'ios';
    native.loadAppOpen.mockClear(); native.appOpenLoaded = false;
    localStorage.clear();
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('probe without the hanging mock', async () => {
    const { recordGameResult, getRankedGames } = await import('./local-stats');
    recordGameResult(200, true, 0, 'first-match');
    console.log('ranked=', getRankedGames());
    const m = await import('./admob');
    const r = await vi.waitFor(async () => {
      const v = await Promise.race([m.showAppOpenAd(), new Promise((res) => setTimeout(() => res('pending'), 1))]);
      return v;
    }, { timeout: 1, interval: 1 });
    console.log('plain result=', r, 'calls=', native.loadAppOpen.mock.calls.length);
    expect(typeof r).toBe('boolean');
  });

  it('probe with the hanging mock', async () => {
    const { recordGameResult, getRankedGames } = await import('./local-stats');
    recordGameResult(200, true, 0, 'first-match');
    console.log('ranked=', getRankedGames());
    native.loadAppOpen.mockImplementationOnce(() => new Promise<void>(() => {}));
    const m = await import('./admob');
    let result: boolean | undefined;
    void m.showAppOpenAd().then((shown) => { result = shown; });
    await vi.advanceTimersByTimeAsync(13_000);
    console.log('hanging result=', result, 'calls=', native.loadAppOpen.mock.calls.length, 'loaded=', native.appOpenLoaded);
    expect(result).toBe(false);
  });
});
    expect(true).toBe(true);
  });
});
