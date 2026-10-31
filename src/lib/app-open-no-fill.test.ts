import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ platform: 'ios', loaded: false,
  load: vi.fn(), show: vi.fn(), check: vi.fn(), events: vi.fn(), notes: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => sdk.platform,
  isNativePlatform: () => true, isPluginAvailable: () => true } }));
vi.mock('./local-stats', () => ({ getRankedGames: () => 1 }));
vi.mock('./waiting-room', () => ({ waitingRoomAdBlocked: () => false }));
vi.mock('./analytics', () => ({ trackEvent: sdk.events }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  AppOpenAdPluginEvents: { AdImpression: 'paid' },
  InterstitialAdPluginEvents: { Dismissed: 'dismissed', FailedToShow: 'failed' },
  AdMob: { requestConsentInfo: async () => ({ canRequestAds: true }),
    initialize: async () => {}, trackingAuthorizationStatus: async () => ({ status: 'denied' }),
    noteAppOpenDiagnostic: sdk.notes, addListener: async () => ({ remove: async () => {} }),
    isAppOpenLoaded: async () => { await sdk.check(); return { value: sdk.loaded }; },
    loadAppOpen: async (options: unknown) => { await sdk.load(options); sdk.loaded = true; },
    showAppOpen: async () => { await sdk.show(); sdk.loaded = false; },
  },
}));
const noFill = () => Object.assign(new Error('DO_NOT_LOG_FREE_ERROR'), {
  data: { error_domain: 'com.google.admob', error_code: 1 },
});
function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); sdk.platform = 'ios'; sdk.loaded = false;
  sdk.load.mockReset().mockResolvedValue(undefined); sdk.show.mockReset().mockResolvedValue(undefined);
  sdk.check.mockReset().mockResolvedValue(undefined); sdk.events.mockClear(); sdk.notes.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('iOS App Open no-fill recovery', () => {
  it('stops the reproduced cold-start A → B → C no-fill chain', async () => {
    sdk.load.mockRejectedValue(noFill());
    const m = await import('./admob');
    expect(await m.preloadAppOpenAd('startup')).toBe(false);
    expect(await m.showAppOpenAd(() => true, 'startup')).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.load).toHaveBeenCalledTimes(1);
    expect(sdk.show).not.toHaveBeenCalled();
  });
  it.each(['startup', 'resume', 'background', 'preload', 'after_presentation'] as const)('shares the pause with %s', async source => {
    sdk.load.mockRejectedValueOnce(noFill());
    const m = await import('./admob'); await m.preloadAppOpenAd('startup');
    expect(await m.preloadAppOpenAd(source)).toBe(false);
    expect(await m.showAppOpenAd(() => true, source)).toBe(false);
    expect(sdk.load).toHaveBeenCalledTimes(1);
    expect(sdk.notes).toHaveBeenCalledWith(expect.objectContaining({ stage: 'retry_paused', source }));
  });
  it('allows a new trigger at 60 seconds, not at 59,999 ms, with no scheduled retry', async () => {
    sdk.load.mockRejectedValueOnce(noFill());
    const m = await import('./admob'); await m.preloadAppOpenAd();
    expect(m.APP_OPEN_NO_FILL_RETRY_MS).toBe(60_000);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(await m.preloadAppOpenAd()).toBe(false);
    expect(sdk.load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sdk.load).toHaveBeenCalledTimes(1);
    expect(await m.preloadAppOpenAd('resume')).toBe(true);
    expect(sdk.load).toHaveBeenCalledTimes(2);
  });
  it('uses valid cache even during the no-fill pause', async () => {
    sdk.load.mockRejectedValueOnce(noFill()); const m = await import('./admob');
    await m.preloadAppOpenAd(); sdk.loaded = true;
    expect(await m.preloadAppOpenAd()).toBe(true);
    expect(await m.showAppOpenAd()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.show).toHaveBeenCalledOnce(); expect(sdk.load).toHaveBeenCalledTimes(1);
  });
  it('does not automatically refill after a non-no-fill load failure', async () => {
    sdk.load.mockRejectedValueOnce(Object.assign(new Error('network'), { data: { error_domain: 'com.google.admob', error_code: 2 } }));
    const m = await import('./admob'); expect(await m.showAppOpenAd()).toBe(false);
    await vi.advanceTimersByTimeAsync(0); expect(sdk.load).toHaveBeenCalledOnce();
    expect(await m.preloadAppOpenAd()).toBe(true); expect(sdk.load).toHaveBeenCalledTimes(2);
  });
  it.each([
    { data: { error_domain: 'other', error_code: 1 } }, { message: 'no fill' },
  ])('does not infer no-fill from arbitrary domains or error messages', async error => {
    sdk.load.mockRejectedValueOnce(error); const m = await import('./admob');
    await m.preloadAppOpenAd(); expect(await m.preloadAppOpenAd()).toBe(true);
    expect(sdk.load).toHaveBeenCalledTimes(2);
  });
  it('leaves Android retries unchanged', async () => {
    sdk.platform = 'android'; sdk.load.mockRejectedValueOnce(noFill());
    const m = await import('./admob'); await m.preloadAppOpenAd();
    expect(await m.preloadAppOpenAd()).toBe(true); expect(sdk.load).toHaveBeenCalledTimes(2);
  });
  it('shares a pending load and retains its original ID and source', async () => {
    const pending = deferred(); sdk.load.mockReturnValueOnce(pending.promise);
    const m = await import('./admob'); const a = m.preloadAppOpenAd('background');
    await vi.advanceTimersByTimeAsync(0); const b = m.preloadAppOpenAd('startup');
    await vi.advanceTimersByTimeAsync(0); pending.resolve();
    expect(await a).toBe(true); expect(await b).toBe(true);
    expect(sdk.load).toHaveBeenCalledOnce();
    expect(sdk.load).toHaveBeenCalledWith(expect.objectContaining({ diagnosticSource: 'background', diagnosticAttemptId: expect.any(String) }));
    expect(sdk.notes).toHaveBeenCalledWith(expect.objectContaining({ stage: 'preload_reused_pending', attempt_id: sdk.load.mock.calls[0][0].diagnosticAttemptId }));
    expect(await m.preloadAppOpenAd()).toBe(true); expect(sdk.load).toHaveBeenCalledOnce();
  });
  it('does not load when canShow is false at entry', async () => {
    const m = await import('./admob'); expect(await m.showAppOpenAd(() => false)).toBe(false);
    expect(sdk.load).not.toHaveBeenCalled(); expect(sdk.check).not.toHaveBeenCalled();
  });
  it('checks canShow again before a new load', async () => {
    let valid = true; sdk.check.mockImplementationOnce(() => { valid = false; });
    const m = await import('./admob'); expect(await m.showAppOpenAd(() => valid)).toBe(false);
    expect(sdk.load).not.toHaveBeenCalled();
  });
  it('retains a timed-out native load and caches its late success without late presentation', async () => {
    const pending = deferred(); sdk.load.mockReturnValueOnce(pending.promise);
    const m = await import('./admob'); const showing = m.showAppOpenAd();
    await vi.advanceTimersByTimeAsync(12_000); expect(await showing).toBe(false);
    const preload = m.preloadAppOpenAd('background'); await vi.advanceTimersByTimeAsync(0);
    expect(sdk.load).toHaveBeenCalledOnce(); pending.resolve();
    expect(await preload).toBe(true); expect(sdk.show).not.toHaveBeenCalled();
    expect(await m.preloadAppOpenAd()).toBe(true); expect(sdk.load).toHaveBeenCalledOnce();
  });
  it('starts the pause on a late SDK no-fill, not the caller timeout', async () => {
    const pending = deferred(); sdk.load.mockReturnValueOnce(pending.promise);
    const m = await import('./admob'); const showing = m.showAppOpenAd();
    await vi.advanceTimersByTimeAsync(12_000); expect(await showing).toBe(false);
    pending.reject(noFill()); await vi.advanceTimersByTimeAsync(0);
    expect(await m.preloadAppOpenAd()).toBe(false); expect(sdk.load).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await m.preloadAppOpenAd()).toBe(true); expect(sdk.load).toHaveBeenCalledTimes(2);
  });
  it('retains a late load but never presents over a changed context', async () => {
    let valid = true; const pending = deferred(); sdk.load.mockReturnValueOnce(pending.promise);
    const m = await import('./admob'); const showing = m.showAppOpenAd(() => valid);
    await vi.advanceTimersByTimeAsync(0); valid = false; pending.resolve();
    expect(await showing).toBe(false); expect(sdk.show).not.toHaveBeenCalled();
    expect(await m.preloadAppOpenAd()).toBe(true); expect(sdk.load).toHaveBeenCalledOnce();
  });
  it('preloads a replacement after the presented ad is consumed', async () => {
    const m = await import('./admob'); expect(await m.showAppOpenAd()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.show).toHaveBeenCalledOnce(); expect(sdk.load).toHaveBeenCalledTimes(2);
    expect(sdk.load.mock.calls[1][0]).toEqual(expect.objectContaining({ diagnosticSource: 'after_presentation' }));
    expect(sdk.load.mock.calls[1][0].diagnosticAttemptId).not.toBe(sdk.load.mock.calls[0][0].diagnosticAttemptId);
  });
});