import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const n = vi.hoisted(() => ({
  platform: 'ios', eligible: true, info: vi.fn(), form: vi.fn(), clear: vi.fn(), eligibility: vi.fn(), consentForm: vi.fn(),
  interstitial: vi.fn(), rewarded: vi.fn(), open: vi.fn(), show: vi.fn(),
  handlers: new Map<string, () => void>(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => n.platform, isNativePlatform: () => true, isPluginAvailable: () => true,
} }));
vi.mock('./local-stats', () => ({ getRankedGames: () => 1 }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  InterstitialAdPluginEvents: { Dismissed: 'dismissed', FailedToShow: 'failed' },
  RewardAdPluginEvents: { Rewarded: 'reward', Showed: 'showed', Dismissed: 'r_dismissed', FailedToShow: 'r_failed' },
  AdMob: {
    requestConsentInfo: n.info, showPrivacyOptionsForm: n.form, discardPrivacyCaches: n.clear,
    getConsentEligibility: n.eligibility, showConsentForm: n.consentForm,
    initialize: async () => {}, trackingAuthorizationStatus: async () => ({ status: 'denied' }),
    prepareInterstitial: n.interstitial, prepareRewardVideoAd: n.rewarded,
    isAppOpenLoaded: async () => ({ value: false }), loadAppOpen: n.open,
    showInterstitial: n.show, showAppOpen: n.show, showRewardVideoAd: n.show,
    addListener: async (event: string, fn: () => void) => {
      n.handlers.set(event, fn);
      return { remove: async () => { n.handlers.delete(event); } };
    },
  },
}));

describe.each(['ios', 'android'])('%s privacy cache boundary', platform => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks(); n.handlers.clear();
    n.platform = platform; n.eligible = true;
    n.info.mockImplementation(async () => ({ canRequestAds: n.eligible }));
    n.eligibility.mockResolvedValue({ canRequestAds: false });
    n.clear.mockResolvedValue({ privacyCacheVersion: 1 }); n.form.mockResolvedValue(undefined);
    n.interstitial.mockResolvedValue({}); n.rewarded.mockResolvedValue({}); n.open.mockResolvedValue({});
    n.show.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it.each(['error', 'timeout', 'form_error', 'form_timeout'])('checks current UMP after %s in allowed and blocked modes', async failure => {
    for (const permitted of [true, false]) {
      vi.resetModules(); n.interstitial.mockClear(); n.eligibility.mockClear();
      n.eligibility.mockResolvedValue({ canRequestAds: permitted });
      const reject = async () => { throw new Error('UMP error'); };
      const hang = () => new Promise<never>(() => {});
      n.info.mockImplementation(failure.startsWith('form')
        ? async () => ({ isConsentFormAvailable: true, status: 'REQUIRED', canRequestAds: false })
        : failure === 'error' ? reject : hang);
      n.consentForm.mockImplementation(failure === 'form_error' ? reject : hang);
      const m = await import('./admob');
      // initialize may time out while the form is pending; after the UMP
      // operation settles the next attempt must use the authoritative result.
      const attempt = m.preloadInterstitial();
      await vi.advanceTimersByTimeAsync(failure === 'form_timeout' ? 120_001 : 10_001);
      await attempt;
      if (failure.includes('timeout')) {
        n.info.mockImplementation(reject);
        const retry = m.preloadInterstitial();
        await vi.advanceTimersByTimeAsync(130_001);
        await retry;
      }
      expect(n.eligibility).toHaveBeenCalled();
      expect(n.interstitial.mock.calls.length > 0).toBe(platform === 'ios' && failure.includes('timeout') ? false : permitted);
    }
  });

  it.each(['missing', 'read_error', 'read_timeout', 'unknown'])('blocks ads when current UMP eligibility is %s', async failure => {
    n.info.mockRejectedValue(new Error('refresh failed'));
    n.eligibility.mockImplementation(failure === 'read_timeout' ? () => new Promise<never>(() => {})
      : failure === 'unknown' ? async () => ({ canRequestAds: undefined })
      : async () => { throw new Error(failure === 'missing' ? 'UNIMPLEMENTED' : 'read failed'); });
    const m = await import('./admob'); const attempt = m.preloadInterstitial();
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await attempt).toBe(false);
    expect(n.interstitial).not.toHaveBeenCalled();
  });

  it('discards old interstitial and rewarded inventory before and after changed choices', async () => {
    const m = await import('./admob');
    await m.preloadInterstitial(); await m.preloadRewarded();
    expect(await m.showAdPrivacyOptions()).toBe(true);
    expect(n.clear).toHaveBeenCalledTimes(2);
    expect(n.clear.mock.invocationCallOrder[0]).toBeLessThan(n.form.mock.invocationCallOrder[0]);
    expect(await m.showPostMatchInterstitial()).toBe('unavailable');
    await m.preloadInterstitial(); await m.preloadRewarded();
    expect(n.interstitial).toHaveBeenCalledTimes(2);
    expect(n.rewarded).toHaveBeenCalledTimes(2);
  });

  it('blocks every load/show while privacy options are open', async () => {
    let close: () => void = () => {};
    n.form.mockImplementation(() => new Promise<void>(resolve => { close = resolve; }));
    const m = await import('./admob'); const change = m.showAdPrivacyOptions();
    await vi.advanceTimersByTimeAsync(0);
    expect(await m.preloadInterstitial()).toBe(false);
    expect(await m.preloadRewarded()).toBe(false);
    expect(await m.preloadAppOpenAd()).toBe(false);
    expect(await m.showOptionalRewarded()).toBe('busy');
    expect(await m.showOptionalInterstitial()).toBe('busy');
    expect(await m.showAppOpenAd()).toBe(false);
    expect(n.show).not.toHaveBeenCalled(); close(); await change;
  });

  it('does not promote a late old-generation prepare into usable inventory', async () => {
    let done: () => void = () => {};
    n.interstitial.mockImplementationOnce(() => new Promise<void>(resolve => { done = resolve; }));
    const m = await import('./admob'); const old = m.preloadInterstitial();
    await vi.advanceTimersByTimeAsync(0);
    await m.showAdPrivacyOptions(); done();
    expect(await old).toBe(false);
    expect(await m.showPostMatchInterstitial()).toBe('unavailable');
    expect(await m.preloadInterstitial()).toBe(true);
    expect(n.interstitial).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the installed native cache bridge is unavailable', async () => {
    n.clear.mockRejectedValue(new Error('UNIMPLEMENTED'));
    const m = await import('./admob'); await m.preloadInterstitial();
    expect(await m.showAdPrivacyOptions()).toBe(false);
    expect(n.form).not.toHaveBeenCalled();
    expect(await m.showPostMatchInterstitial()).toBe('busy');
    expect(await m.preloadRewarded()).toBe(false);
  });

  it('does not interpret denied personalization as denied ad eligibility', async () => {
    n.form.mockImplementation(async () => { n.eligible = true; });
    const m = await import('./admob');
    expect(await m.showAdPrivacyOptions()).toBe(true);
    expect(await m.preloadRewarded()).toBe(true);
  });

  it('blocks fresh requests when UMP reports requests are not permitted', async () => {
    n.form.mockImplementation(async () => { n.eligible = false; });
    const m = await import('./admob');
    expect(await m.showAdPrivacyOptions()).toBe(true);
    expect(await m.preloadInterstitial()).toBe(false);
    expect(await m.preloadRewarded()).toBe(false);
    expect(await m.preloadAppOpenAd()).toBe(false);
  });

  it('blocks ads after privacy form failure and allows a successful retry', async () => {
    n.form.mockRejectedValueOnce(new Error('private choice must not be logged'));
    const m = await import('./admob');
    expect(await m.showAdPrivacyOptions()).toBe(false);
    expect(await m.preloadInterstitial()).toBe(false);
    expect(await m.showAdPrivacyOptions()).toBe(true);
    expect(await m.preloadInterstitial()).toBe(true);
  });

  it('uses UMP again after restart without resetting its saved choice', async () => {
    const first = await import('./admob');
    await first.showAdPrivacyOptions();
    vi.resetModules(); n.info.mockClear();
    const restarted = await import('./admob');
    expect(await restarted.preloadRewarded()).toBe(true);
    expect(n.info).toHaveBeenCalledOnce();
    expect(n.clear).toHaveBeenCalledTimes(2);
  });

  it('does not interrupt an active fullscreen ad to open privacy options', async () => {
    const m = await import('./admob'); await m.preloadInterstitial();
    const shown = m.showPostMatchInterstitial(); await vi.advanceTimersByTimeAsync(0);
    expect(await m.showAdPrivacyOptions()).toBe(false);
    expect(n.clear).not.toHaveBeenCalled(); expect(n.form).not.toHaveBeenCalled();
    n.handlers.get('dismissed')?.(); expect(await shown).toBe('shown');
  });
});