import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ platform: 'ios', loaded: false, games: 1, blocked: false,
  consent: vi.fn(), init: vi.fn(), load: vi.fn(), show: vi.fn(), check: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => sdk.platform,
  isNativePlatform: () => true, isPluginAvailable: () => true } }));
vi.mock('./local-stats', () => ({ getRankedGames: () => sdk.games }));
vi.mock('./waiting-room', () => ({ waitingRoomAdBlocked: () => sdk.blocked }));
vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  AppOpenAdPluginEvents: { AdImpression: 'paid' },
  InterstitialAdPluginEvents: { Dismissed: 'dismissed', FailedToShow: 'failed' },
  AdMob: { requestConsentInfo: sdk.consent, initialize: sdk.init,
    trackingAuthorizationStatus: async () => ({ status: 'denied' }),
    noteAppOpenDiagnostic: async () => {}, addListener: async () => ({ remove: async () => {} }),
    isAppOpenLoaded: async () => { await sdk.check(); return { value: sdk.loaded }; },
    loadAppOpen: async () => { await sdk.load(); sdk.loaded = true; },
    showAppOpen: async () => { await sdk.show(); sdk.loaded = false; },
  },
}));
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
describe.each(['ios', 'android'])('%s ready-only resume', platform => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); sdk.platform = platform; sdk.loaded = false; sdk.games = 1; sdk.blocked = false;
    sdk.consent.mockReset().mockResolvedValue({ canRequestAds: true });
    for (const fn of [sdk.init, sdk.load, sdk.show, sdk.check]) fn.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  it('skips without starting initialization', async () => {
    const m = await import('./admob');
    expect(await m.showAppOpenAd(() => true, 'resume')).toBe(false);
    expect(sdk.consent).not.toHaveBeenCalled(); expect(sdk.init).not.toHaveBeenCalled(); expect(sdk.load).not.toHaveBeenCalled();
  });
  it('does not await pending initialization; late preload is cached without presentation', async () => {
    const gate = deferred(); sdk.init.mockReturnValueOnce(gate.promise);
    const m = await import('./admob'); const preload = m.preloadAppOpenAd('background');
    await vi.advanceTimersByTimeAsync(0);
    expect(await m.showAppOpenAd(() => true, 'resume')).toBe(false);
    expect(sdk.load).not.toHaveBeenCalled(); gate.resolve(); expect(await preload).toBe(true);
    expect(sdk.show).not.toHaveBeenCalled(); expect(sdk.loaded).toBe(true);
  });
  it('skips missing cache without starting a load', async () => {
    const m = await import('./admob'); await m.preloadAppOpenAd(); sdk.loaded = false; sdk.load.mockClear();
    expect(await m.showAppOpenAd(() => true, 'resume')).toBe(false);
    expect(sdk.load).not.toHaveBeenCalled(); expect(sdk.show).not.toHaveBeenCalled();
  });
  it('does not await pending load; saves late result for the next return only', async () => {
    const m = await import('./admob'); await m.preloadAppOpenAd(); sdk.loaded = false;
    const gate = deferred(); sdk.load.mockReturnValueOnce(gate.promise);
    const preload = m.preloadAppOpenAd('background'); await vi.advanceTimersByTimeAsync(0);
    expect(await m.showAppOpenAd(() => true, 'resume')).toBe(false);
    expect(sdk.load).toHaveBeenCalledTimes(2); gate.resolve(); expect(await preload).toBe(true);
    expect(sdk.show).not.toHaveBeenCalled(); expect(sdk.loaded).toBe(true);
    expect(await m.showAppOpenAd(() => true, 'resume')).toBe(true); expect(sdk.show).toHaveBeenCalledOnce();
  });
  it('shows ready cache without waiting for an unrelated preload check', async () => {
    const m = await import('./admob'); await m.preloadAppOpenAd();
    const gate = deferred(); sdk.check.mockReturnValueOnce(gate.promise);
    const preload = m.preloadAppOpenAd('background'); await vi.advanceTimersByTimeAsync(0);
    expect(await m.showAppOpenAd(() => true, 'resume')).toBe(true);
    expect(sdk.show).toHaveBeenCalledOnce(); gate.resolve(); await preload;
  });
  it('keeps first-match and waiting-room restrictions', async () => {
    const m = await import('./admob'); await m.preloadAppOpenAd();
    sdk.games = 0; expect(await m.showAppOpenAd(() => true, 'resume')).toBe(false);
    sdk.games = 1; sdk.blocked = true; expect(await m.showAppOpenAd(() => true, 'resume')).toBe(false);
    expect(sdk.show).not.toHaveBeenCalled();
  });
  it('rechecks navigation before presenting ready cache', async () => {
    const m = await import('./admob'); await m.preloadAppOpenAd();
    let home = true; sdk.check.mockImplementationOnce(() => { home = false; });
    expect(await m.showAppOpenAd(() => home, 'resume')).toBe(false);
    expect(sdk.show).not.toHaveBeenCalled(); expect(sdk.loaded).toBe(true);
  });
});