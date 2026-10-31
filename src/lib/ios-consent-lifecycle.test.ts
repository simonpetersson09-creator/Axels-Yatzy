import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const s = vi.hoisted(() => ({ info: vi.fn(), form: vi.fn(), status: vi.fn(), att: vi.fn(), init: vi.fn(), load: vi.fn(), note: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true, isPluginAvailable: () => true } }));
vi.mock('./local-stats', () => ({ getRankedGames: () => 1 }));
vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({ AdmobConsentStatus: { REQUIRED: 'REQUIRED' }, InterstitialAdPluginEvents: {}, AdMob: {
  requestConsentInfo: s.info, showConsentForm: s.form, trackingAuthorizationStatus: s.status, requestTrackingAuthorization: s.att,
  initialize: s.init, prepareInterstitial: s.load, prepareRewardVideoAd: s.load,
  getConsentEligibility: async () => ({ canRequestAds: true }), noteAppOpenDiagnostic: s.note,
  addListener: async () => ({ remove: async () => {} }),
} }));
function gate<T>() { let resolve: (value: T) => void = () => {}; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); Object.values(s).forEach(f => f.mockReset()); s.info.mockResolvedValue({ canRequestAds: true }); s.status.mockResolvedValue({ status: 'denied' }); s.init.mockResolvedValue({}); s.load.mockResolvedValue({}); s.note.mockResolvedValue({}); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('two simultaneous callers own exactly one UMP request', async () => {
  const g = gate<{ canRequestAds: boolean }>(); s.info.mockReturnValue(g.promise);
  const m = await import('./admob'); const a = m.preloadInterstitial(); const b = m.preloadRewarded();
  await vi.advanceTimersByTimeAsync(0); expect(s.info).toHaveBeenCalledOnce();
  g.resolve({ canRequestAds: true }); await Promise.all([a,b]); expect(s.init).toHaveBeenCalledOnce();
});
it('timeout and new caller do not open a second UMP form; late answer has one continuation', async () => {
  const g = gate<{ canRequestAds: boolean }>(); s.info.mockResolvedValue({ isConsentFormAvailable: true, status: 'REQUIRED' }); s.form.mockReturnValue(g.promise);
  const m = await import('./admob'); const first = m.preloadInterstitial();
  await vi.advanceTimersByTimeAsync(130_000); expect(await first).toBe(false);
  const retry = m.preloadInterstitial(); await vi.advanceTimersByTimeAsync(0);
  expect(s.form).toHaveBeenCalledOnce(); expect(s.init).not.toHaveBeenCalled();
  g.resolve({ canRequestAds: true }); expect(await retry).toBe(true);
  expect(s.init).toHaveBeenCalledOnce(); expect(s.load).toHaveBeenCalledOnce();
  expect(s.note.mock.calls.some(([r]) => r.stage === 'consent_finished')).toBe(true);
});
it('a never-returning UMP attempt remains owned without freezing callers', async () => {
  s.info.mockReturnValue(new Promise(() => {})); const m = await import('./admob');
  for (let i=0; i<3; i++) { const p=m.preloadInterstitial(); await vi.advanceTimersByTimeAsync(20_000); expect(await p).toBe(false); }
  expect(s.info).toHaveBeenCalledOnce(); expect(s.att).not.toHaveBeenCalled(); expect(s.load).not.toHaveBeenCalled();
});
it('deferred ATT and repeated foreground callers retain one native attempt until real answer', async () => {
  const g = gate<void>(); s.status.mockResolvedValue({ status: 'notDetermined' }); s.att.mockReturnValue(g.promise);
  const m = await import('./admob'); const first=m.preloadInterstitial(); await vi.advanceTimersByTimeAsync(130_000); expect(await first).toBe(false);
  const a=m.preloadInterstitial(); const b=m.preloadRewarded(); await vi.advanceTimersByTimeAsync(0); expect(s.att).toHaveBeenCalledOnce(); expect(s.init).not.toHaveBeenCalled();
  s.status.mockResolvedValue({ status: 'denied' }); g.resolve(); await Promise.all([a,b]); expect(s.init).toHaveBeenCalledOnce();
});
it.each(['authorized','denied','restricted'])('preserves existing %s ATT and permits UMP-eligible ads', async status => {
  s.status.mockResolvedValue({ status }); const m=await import('./admob'); expect(await m.preloadInterstitial()).toBe(true);
  expect(s.att).not.toHaveBeenCalled(); expect(s.load).toHaveBeenCalledOnce();
});