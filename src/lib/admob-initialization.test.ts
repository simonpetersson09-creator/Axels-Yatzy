import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  platform: 'ios',
  consent: vi.fn(), initialize: vi.fn(), status: vi.fn(), att: vi.fn(),
  interstitial: vi.fn(), rewarded: vi.fn(), appOpen: vi.fn(),
  eligibility: vi.fn(), discard: vi.fn(), privacy: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => sdk.platform, isNativePlatform: () => true, isPluginAvailable: () => true,
} }));
vi.mock('./local-stats', () => ({ getRankedGames: () => 1 }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  InterstitialAdPluginEvents: { Dismissed: 'dismissed', FailedToShow: 'failed' },
  RewardAdPluginEvents: {},
  AdMob: {
    requestConsentInfo: sdk.consent, initialize: sdk.initialize,
    trackingAuthorizationStatus: sdk.status, requestTrackingAuthorization: sdk.att,
    prepareInterstitial: sdk.interstitial, prepareRewardVideoAd: sdk.rewarded,
    isAppOpenLoaded: async () => ({ value: false }), loadAppOpen: sdk.appOpen,
    addListener: vi.fn(async () => ({ remove: async () => {} })),
    getConsentEligibility: sdk.eligibility, discardPrivacyCaches: sdk.discard,
    showPrivacyOptionsForm: sdk.privacy,
  },
}));

function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe.each(['ios', 'android'])('%s shared ad initialization', (platform) => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); sdk.platform = platform;
    Object.values(sdk).forEach(value => { if (typeof value === 'function') value.mockReset(); });
    sdk.consent.mockResolvedValue({ canRequestAds: true });
    sdk.status.mockResolvedValue({ status: 'authorized' });
    sdk.initialize.mockResolvedValue(undefined);
    sdk.interstitial.mockResolvedValue(undefined); sdk.rewarded.mockResolvedValue({});
    sdk.appOpen.mockResolvedValue(undefined); sdk.eligibility.mockResolvedValue({ canRequestAds: false });
    sdk.discard.mockResolvedValue({ privacyCacheVersion: 1 }); sdk.privacy.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('initializes once for simultaneous interstitial, rewarded and App Open loads', async () => {
    const gate = deferred(); sdk.initialize.mockReturnValue(gate.promise);
    const m = await import('./admob');
    const loads = [m.preloadInterstitial(), m.preloadRewarded(), m.preloadAppOpenAd()];
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.initialize).toHaveBeenCalledOnce();
    expect(sdk.consent).toHaveBeenCalledOnce();
    expect(sdk.interstitial).not.toHaveBeenCalled();
    expect(sdk.rewarded).not.toHaveBeenCalled();
    expect(sdk.appOpen).not.toHaveBeenCalled();
    gate.resolve(); await Promise.all(loads);
    expect(sdk.initialize).toHaveBeenCalledOnce();
    expect(sdk.interstitial).toHaveBeenCalledOnce();
    expect(sdk.rewarded).toHaveBeenCalledOnce();
    expect(sdk.appOpen).toHaveBeenCalledOnce();
  });

  it('retains the native initialization after caller timeout and reuses its late success', async () => {
    const gate = deferred(); sdk.initialize.mockReturnValue(gate.promise);
    const m = await import('./admob');
    const first = m.preloadInterstitial();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await first).toBe(false);
    const retry = m.preloadInterstitial();
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.initialize).toHaveBeenCalledOnce();
    gate.resolve(); expect(await retry).toBe(true);
    expect(sdk.initialize).toHaveBeenCalledOnce();
  });

  it('releases a failed initialization for one shared retry', async () => {
    const gate = deferred(); sdk.initialize.mockReturnValueOnce(gate.promise);
    const m = await import('./admob');
    const first = m.preloadInterstitial(); const second = m.preloadRewarded();
    await vi.advanceTimersByTimeAsync(0); gate.reject(new Error('SDK failed'));
    expect(await first).toBe(false); expect(await second).toBe(false);
    expect(sdk.initialize).toHaveBeenCalledOnce();
    await Promise.all([m.preloadInterstitial(), m.preloadRewarded()]);
    expect(sdk.initialize).toHaveBeenCalledTimes(2);
  });

  it('does not initialize or load any format when UMP denies eligibility', async () => {
    sdk.consent.mockResolvedValue({ canRequestAds: false });
    const m = await import('./admob');
    expect(await m.preloadInterstitial()).toBe(false);
    expect(await m.preloadRewarded()).toBe(false);
    expect(await m.preloadAppOpenAd()).toBe(false);
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.interstitial).not.toHaveBeenCalled();
    expect(sdk.rewarded).not.toHaveBeenCalled();
    expect(sdk.appOpen).not.toHaveBeenCalled();
  });

  it('rejects old ad loads when consent changes during native initialization', async () => {
    const gate = deferred(); sdk.initialize.mockReturnValue(gate.promise);
    const m = await import('./admob'); const oldLoad = m.preloadInterstitial();
    await vi.advanceTimersByTimeAsync(0);
    expect(await m.showAdPrivacyOptions()).toBe(true);
    gate.resolve(); expect(await oldLoad).toBe(false);
    expect(sdk.interstitial).not.toHaveBeenCalled();
    expect(await m.preloadInterstitial()).toBe(true);
    expect(sdk.initialize).toHaveBeenCalledOnce();
  });
});

describe('iOS ATT during shared initialization', () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); sdk.platform = 'ios';
    sdk.consent.mockReset().mockResolvedValue({ canRequestAds: true });
    sdk.initialize.mockReset().mockResolvedValue(undefined);
    sdk.status.mockReset().mockResolvedValue({ status: 'notDetermined' });
    sdk.att.mockReset(); sdk.interstitial.mockReset().mockResolvedValue(undefined);
    sdk.rewarded.mockReset().mockResolvedValue({});
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('asks ATT once and waits beyond ten seconds before initializing or loading', async () => {
    const answer = deferred(); sdk.att.mockReturnValue(answer.promise);
    const m = await import('./admob');
    const first = m.preloadInterstitial(); const second = m.preloadRewarded();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(sdk.att).toHaveBeenCalledOnce();
    expect(sdk.consent).toHaveBeenCalledOnce();
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.interstitial).not.toHaveBeenCalled(); expect(sdk.rewarded).not.toHaveBeenCalled();
    answer.resolve();
    expect(await first).toBe(true); expect(await second).toBe(true);
    expect(sdk.initialize).toHaveBeenCalledOnce();
  });
});