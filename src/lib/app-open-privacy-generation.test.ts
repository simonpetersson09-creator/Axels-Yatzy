import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ loaded: false, generation: 0, eligible: true,
  load: vi.fn(), check: vi.fn(), info: vi.fn(), events: vi.fn(), notes: vi.fn(), privacy: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true, isPluginAvailable: () => true } }));
vi.mock('./local-stats', () => ({ getRankedGames: () => 1 }));
vi.mock('./analytics', () => ({ trackEvent: sdk.events }));
vi.mock('@capacitor-community/admob', () => ({ AdmobConsentStatus: { REQUIRED: 'REQUIRED' }, AppOpenAdPluginEvents: {}, InterstitialAdPluginEvents: {}, AdMob: {
  requestConsentInfo: sdk.info, initialize: async () => {}, trackingAuthorizationStatus: async () => ({ status: 'denied' }),
  noteAppOpenDiagnostic: sdk.notes, addListener: async () => ({ remove: async () => {} }),
  showPrivacyOptionsForm: sdk.privacy,
  discardPrivacyCaches: async () => { sdk.generation++; sdk.loaded=false; return { privacyCacheVersion: 1 }; },
  isAppOpenLoaded: async () => { await sdk.check(); return { value: sdk.loaded }; },
  // This mock enforces the native validity contract; separate patch tests check Swift boundaries.
  loadAppOpen: async (options: unknown) => { const generation=sdk.generation; await sdk.load(options); if(generation===sdk.generation) sdk.loaded=true; },
} }));
function deferred() { let resolve: () => void=()=>{}; let reject:(e:unknown)=>void=()=>{}; const promise=new Promise<void>((r,j)=>{resolve=r;reject=j;}); return { promise,resolve,reject }; }
const noFill=()=>({data:{error_domain:'com.google.admob',error_code:1}});
beforeEach(()=>{vi.resetModules(); vi.useFakeTimers(); sdk.loaded=false; sdk.generation=0; sdk.eligible=true;
  sdk.info.mockReset().mockImplementation(async()=>({canRequestAds:sdk.eligible})); sdk.privacy.mockReset().mockResolvedValue({});
  sdk.load.mockReset().mockResolvedValue({}); sdk.check.mockReset().mockResolvedValue({}); sdk.notes.mockReset().mockResolvedValue({}); sdk.events.mockClear();});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
it.each(['success','error'] as const)('invalidates a pending load with late %s and permits a new load without restart',async outcome=>{
  const old=deferred(); sdk.load.mockReturnValueOnce(old.promise); const m=await import('./admob'); const a=m.preloadAppOpenAd();
  await vi.advanceTimersByTimeAsync(0); expect(await m.showAdPrivacyOptions()).toBe(true);
  outcome==='success'?old.resolve():old.reject(noFill()); await vi.advanceTimersByTimeAsync(0);
  expect(await a).toBe(false); expect(sdk.loaded).toBe(false);
  expect(await m.preloadAppOpenAd()).toBe(true); expect(sdk.load).toHaveBeenCalledTimes(2);
  expect(sdk.info).toHaveBeenCalledTimes(2);
});
it.each(['success','error'] as const)('old %s after replacement starts cannot release the replacement lock',async outcome=>{
  const old=deferred(),fresh=deferred(); sdk.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const m=await import('./admob'); const a=m.preloadAppOpenAd(); await vi.advanceTimersByTimeAsync(0); await m.showAdPrivacyOptions();
  const b=m.preloadAppOpenAd(); await vi.advanceTimersByTimeAsync(0); outcome==='success'?old.resolve():old.reject(noFill());
  await vi.advanceTimersByTimeAsync(0); expect(await a).toBe(false); const shared=m.preloadAppOpenAd();
  await vi.advanceTimersByTimeAsync(0); expect(sdk.load).toHaveBeenCalledTimes(2);
  fresh.resolve(); expect(await b).toBe(true); expect(await shared).toBe(true);
});
it.each(['success','error'] as const)('old %s after replacement succeeds leaves the new cache intact',async outcome=>{
  const old=deferred();sdk.load.mockReturnValueOnce(old.promise);const m=await import('./admob');const a=m.preloadAppOpenAd();
  await vi.advanceTimersByTimeAsync(0);await m.showAdPrivacyOptions();expect(await m.preloadAppOpenAd()).toBe(true);
  outcome==='success'?old.resolve():old.reject(noFill());await vi.advanceTimersByTimeAsync(0);expect(await a).toBe(false);
  expect(await m.preloadAppOpenAd()).toBe(true);expect(sdk.load).toHaveBeenCalledTimes(2);
});
it('privacy change while a cache check is scheduled prevents the old SDK call',async()=>{
  const checked=deferred();sdk.check.mockReturnValueOnce(checked.promise);const m=await import('./admob');const a=m.preloadAppOpenAd();
  await vi.advanceTimersByTimeAsync(0);await m.showAdPrivacyOptions();checked.resolve();expect(await a).toBe(false);
  expect(sdk.load).not.toHaveBeenCalled();expect(await m.preloadAppOpenAd()).toBe(true);
});
it('a timed-out old native load does not block the next allowed generation',async()=>{
  const old=deferred();sdk.load.mockReturnValueOnce(old.promise);const m=await import('./admob');const a=m.preloadAppOpenAd();
  await vi.advanceTimersByTimeAsync(20_000);expect(await a).toBe(false);await m.showAdPrivacyOptions();
  expect(await m.preloadAppOpenAd()).toBe(true);old.reject(noFill());await vi.advanceTimersByTimeAsync(0);
  sdk.loaded=false;expect(await m.preloadAppOpenAd()).toBe(true);expect(sdk.load).toHaveBeenCalledTimes(3);
});
it('new loads are blocked when updated UMP disallows requests',async()=>{
  const old=deferred();sdk.load.mockReturnValueOnce(old.promise);const m=await import('./admob');const a=m.preloadAppOpenAd();
  await vi.advanceTimersByTimeAsync(0);sdk.eligible=false;await m.showAdPrivacyOptions();old.resolve();expect(await a).toBe(false);
  expect(await m.preloadAppOpenAd()).toBe(false);expect(sdk.load).toHaveBeenCalledOnce();
});
it('an already earned no-fill pause survives privacy changes',async()=>{
  sdk.load.mockRejectedValueOnce(noFill());const m=await import('./admob');await m.preloadAppOpenAd();await m.showAdPrivacyOptions();
  expect(await m.preloadAppOpenAd()).toBe(false);expect(sdk.load).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60_000);expect(await m.preloadAppOpenAd()).toBe(true);
});