import { beforeEach, it, expect, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ eligibility: vi.fn(), privacy: vi.fn(), load: vi.fn(), show: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true, isPluginAvailable: () => true } }));
vi.mock('./local-stats', () => ({ getRankedGames: () => 1 }));
vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({ AdmobConsentStatus: { REQUIRED: 'REQUIRED' }, AppOpenAdPluginEvents: {}, InterstitialAdPluginEvents: {}, AdMob: {
  requestConsentInfo: async () => ({ canRequestAds: true }), initialize: async () => {}, trackingAuthorizationStatus: async () => ({ status: 'denied' }),
  noteAppOpenDiagnostic: async () => {}, addListener: async () => ({ remove: async () => {} }),
  getConsentEligibility: sdk.eligibility, showPrivacyOptionsForm: sdk.privacy,
  discardPrivacyCaches: async () => ({ privacyCacheVersion: 1 }), isAppOpenLoaded: async () => ({ value: false }),
  loadAppOpen: sdk.load, showAppOpen: sdk.show,
} }));
beforeEach(() => { vi.resetModules(); sdk.privacy.mockReset().mockRejectedValue(new Error('form failed'));
  sdk.eligibility.mockReset(); sdk.load.mockReset().mockResolvedValue({}); sdk.show.mockReset(); });

it('privacy form error + current canRequestAds true lifts the block without showing an ad', async () => {
  sdk.eligibility.mockResolvedValue({ canRequestAds: true });
  const m = await import('./admob');
  expect(await m.showAdPrivacyOptions()).toBe(false);
  expect(sdk.show).not.toHaveBeenCalled();
  expect(sdk.load).not.toHaveBeenCalled();
  expect(await m.preloadAppOpenAd()).toBe(true);
});
it('privacy form error + canRequestAds false keeps ads blocked', async () => {
  sdk.eligibility.mockResolvedValue({ canRequestAds: false });
  const m = await import('./admob');
  await m.showAdPrivacyOptions();
  expect(await m.preloadAppOpenAd()).toBe(false);
  expect(sdk.load).not.toHaveBeenCalled();
});
it('privacy form error + failed eligibility read keeps ads blocked', async () => {
  sdk.eligibility.mockRejectedValue(new Error('bridge missing'));
  const m = await import('./admob');
  await m.showAdPrivacyOptions();
  expect(await m.preloadAppOpenAd()).toBe(false);
  expect(sdk.load).not.toHaveBeenCalled();
});
