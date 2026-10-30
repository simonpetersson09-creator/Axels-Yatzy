import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ status: vi.fn(), att: vi.fn(), track: vi.fn(), init: vi.fn(), order: [] as string[] }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true, isPluginAvailable: () => true } }));
vi.mock('./local-stats', () => ({ getRankedGames: () => 1 }));
vi.mock('./analytics', () => ({ trackEvent: sdk.track }));
vi.mock('@/lib/analytics', () => ({ trackEvent: sdk.track }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  InterstitialAdPluginEvents: { Dismissed: 'd', FailedToShow: 'f' },
  RewardAdPluginEvents: {},
  AdMob: {
    requestConsentInfo: async () => ({ canRequestAds: true }),
    initialize: sdk.init, trackingAuthorizationStatus: sdk.status, requestTrackingAuthorization: sdk.att,
    prepareInterstitial: async () => { sdk.order.push('ad_request'); },
    addListener: vi.fn(async () => ({ remove: async () => {} })),
    getConsentEligibility: async () => ({ canRequestAds: false }),
    discardPrivacyCaches: async () => ({ privacyCacheVersion: 1 }),
  },
}));

const diag = () => sdk.track.mock.calls.filter(c => c[0] === 'ad_att_diag').map(c => c[1]);

describe('ATT diagnostics', () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); sdk.order = [];
    sdk.track.mockReset(); sdk.status.mockReset(); sdk.att.mockReset();
    sdk.init.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('logs first ad request only after the ATT answer, without the answer', async () => {
    sdk.status.mockResolvedValue({ status: 'notDetermined' });
    sdk.att.mockImplementation(async () => { sdk.order.push('att_answer'); return { status: 'denied' }; });
    sdk.track.mockImplementation((n: string) => { if (n === 'ad_att_diag') sdk.order.push('diag'); });
    const m = await import('./admob');
    const p = m.preloadInterstitial(); await vi.advanceTimersByTimeAsync(0); await p;
    expect(sdk.order).toEqual(['att_answer', 'diag', 'ad_request']);
    expect(diag()).toEqual([expect.objectContaining({ stage: 'first_ad_request', att_settled: true, prompted: true })]);
    expect(JSON.stringify(diag())).not.toContain('denied');
  });

  it('logs status_timeout after 5 s', async () => {
    sdk.status.mockReturnValue(new Promise(() => {}));
    const m = await import('./admob');
    const p = m.preloadInterstitial(); await vi.advanceTimersByTimeAsync(5_000); await p;
    expect(diag().map(d => d.stage)).toEqual(['status_timeout', 'first_ad_request']);
  });

  it('logs status_failed on error', async () => {
    sdk.status.mockRejectedValue(new Error('boom'));
    const m = await import('./admob');
    const p = m.preloadInterstitial(); await vi.advanceTimersByTimeAsync(0); await p;
    expect(diag().map(d => d.stage)).toEqual(['status_failed', 'first_ad_request']);
  });

  it('logs request_timeout after 120 s', async () => {
    sdk.status.mockResolvedValue({ status: 'notDetermined' });
    sdk.att.mockReturnValue(new Promise(() => {}));
    const m = await import('./admob');
    const p = m.preloadInterstitial(); await vi.advanceTimersByTimeAsync(120_000); await p;
    expect(diag().map(d => d.stage)).toEqual(['request_timeout', 'first_ad_request']);
  });
});

describe('ad skip diagnostics', () => {
  beforeEach(() => { vi.resetModules(); sdk.track.mockReset(); });
  it('logs App Open first_match_pending once per app start', async () => {
    vi.doMock('./local-stats', () => ({ getRankedGames: () => 0 }));
    const m = await import('./admob');
    await m.preloadAppOpenAd(); await m.showAppOpenAd(); await m.preloadAppOpenAd();
    const skips = sdk.track.mock.calls.filter(c => c[0] === 'ad_skipped').map(c => c[1]);
    expect(skips).toEqual([{ kind: 'appOpen', reason: 'first_match_pending' }]);
    vi.doUnmock('./local-stats');
  });
});
