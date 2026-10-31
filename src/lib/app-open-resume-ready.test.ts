import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

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
    window.history.replaceState(null, '', '/');
    sdk.consent.mockReset().mockResolvedValue({ canRequestAds: true });
    for (const fn of [sdk.init, sdk.load, sdk.show, sdk.check]) fn.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); window.history.replaceState(null, '', '/'); });
  it.each(['/game', '/multiplayer-game'])('never dispatches App Open on %s even without a caller guard', async route => {
    const m = await import('./admob'); await m.preloadAppOpenAd();
    window.history.replaceState(null, '', route);
    expect(await m.showAppOpenAd()).toBe(false);
    expect(await m.showAppOpenAd(() => true, 'resume')).toBe(false);
    expect(sdk.show).not.toHaveBeenCalled(); expect(sdk.loaded).toBe(true);
  });
  it('late cold-start loading caches the ad but cannot cover gameplay', async () => {
    const m = await import('./admob'); await m.preloadAppOpenAd(); sdk.loaded = false;
    const gate = deferred(); sdk.load.mockReturnValueOnce(gate.promise);
    const attempt = m.showAppOpenAd(); await vi.advanceTimersByTimeAsync(0);
    window.history.replaceState(null, '', '/game'); gate.resolve();
    expect(await attempt).toBe(false); expect(sdk.loaded).toBe(true); expect(sdk.show).not.toHaveBeenCalled();
  });
  it('holds gameplay across native queue and show timeout until real dismissal', async () => {
    const m = await import('./admob'); await m.preloadAppOpenAd();
    const gate = deferred(); sdk.show.mockReturnValueOnce(gate.promise);
    const attempt = m.showAppOpenAd(() => true, 'resume'); await vi.advanceTimersByTimeAsync(0);
    const { isAppOpenPresentationPending } = await import('./app-open-presentation');
    const { AppOpenGameGate } = await import('../components/AppOpenGameGate');
    window.history.replaceState(null, '', '/game');
    const view = render(<AppOpenGameGate><div>Playing match</div></AppOpenGameGate>);
    expect(screen.queryByText('Playing match')).toBeNull();
    await vi.advanceTimersByTimeAsync(8_000); expect(await attempt).toBe(true);
    expect(isAppOpenPresentationPending()).toBe(true);
    gate.resolve(); await vi.advanceTimersByTimeAsync(0);
    view.rerender(<AppOpenGameGate><div>Playing match</div></AppOpenGameGate>);
    expect(screen.getByText('Playing match')).toBeTruthy(); expect(isAppOpenPresentationPending()).toBe(false);
  });
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