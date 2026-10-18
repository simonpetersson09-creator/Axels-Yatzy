import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ platform: 'ios', handlers: new Map<string, Set<() => void>>(), show: vi.fn(async () => {}), showRewarded: vi.fn(async () => ({})), prepareRewarded: vi.fn(async () => ({})), banner: { show: vi.fn(async () => {}), hide: vi.fn(async () => {}), resume: vi.fn(async () => {}), remove: vi.fn(async () => {}) }, loadAppOpen: vi.fn(async () => {}), appOpenLoaded: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => native.platform, isNativePlatform: () => true, isPluginAvailable: () => true,
} }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  InterstitialAdPluginEvents: { Dismissed: 'dismissed', FailedToShow: 'failed' },
  BannerAdSize: { BANNER: 'BANNER' }, BannerAdPosition: { BOTTOM_CENTER: 'BOTTOM_CENTER' },
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
const emit = (event: string) => native.handlers.get(event)?.forEach((handler) => handler());

describe('optional ad completion for XP', () => {
  beforeEach(() => { native.platform = 'ios'; vi.resetModules(); vi.useFakeTimers(); native.handlers.clear(); native.show.mockClear(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('waits for dismissal, then permits exactly one 1 XP reward', async () => {
    const { showOptionalInterstitial } = await import('./admob');
    const reward = vi.fn();
    const pending = showOptionalInterstitial().then((result) => {
      if (result === 'shown') reward(1);
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(native.show).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reward).not.toHaveBeenCalled();
    expect(await showOptionalInterstitial()).toBe('busy');
    emit('dismissed');
    expect(await pending).toBe('shown');
    expect(reward).toHaveBeenCalledExactlyOnceWith(1);
    emit('dismissed');
    expect(reward).toHaveBeenCalledOnce();
  });

  it('does not permit XP when presentation fails after resolving', async () => {
    const { showOptionalInterstitial } = await import('./admob');
    const reward = vi.fn();
    const pending = showOptionalInterstitial().then((result) => {
      if (result === 'shown') reward(1);
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    emit('failed');
    expect(await pending).toBe('failed');
    expect(reward).not.toHaveBeenCalled();
  });
});
describe('iOS rewarded XP ad', () => {
  beforeEach(() => {
    native.platform = 'ios';
    vi.resetModules(); vi.useFakeTimers(); native.handlers.clear();
    native.showRewarded.mockReset(); native.showRewarded.mockReturnValue(new Promise(() => {})); native.prepareRewarded.mockReset(); native.prepareRewarded.mockResolvedValue({});
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('gives exactly one reward only after the SDK reward event', async () => {
    const { showOptionalRewarded } = await import('./admob');
    const reward = vi.fn();
    const pending = showOptionalRewarded().then((r) => { if (r === 'rewarded') reward(1); return r; });
    await vi.advanceTimersByTimeAsync(0);
    expect(native.showRewarded).toHaveBeenCalledOnce();
    expect(await showOptionalRewarded()).toBe('busy');
    emit('r_reward'); emit('r_reward');
    emit('r_dismissed');
    expect(await pending).toBe('rewarded');
    emit('r_reward'); emit('r_dismissed');
    expect(reward).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('closing before the reward is earned gives no XP', async () => {
    const { showOptionalRewarded } = await import('./admob');
    const pending = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    emit('r_dismissed');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBe('not_earned');
  });

  it('load failure returns failed and frees the button', async () => {
    native.prepareRewarded.mockRejectedValue(new Error('no fill'));
    const { showOptionalRewarded } = await import('./admob');
    expect(await showOptionalRewarded()).toBe('failed');
    expect(native.showRewarded).not.toHaveBeenCalled();
    native.prepareRewarded.mockResolvedValue({});
    const again = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    expect(native.showRewarded).toHaveBeenCalledOnce();
    emit('r_failed');
    expect(await again).toBe('failed');
  });

  it('start ad is suppressed right after returning from the rewarded ad', async () => {
    const { showOptionalRewarded, showAppOpenAd } = await import('./admob');
    const pending = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    emit('r_reward'); emit('r_dismissed');
    await pending;
    expect(await showAppOpenAd()).toBe(false);
  });
});

describe('Android rewarded XP ad', () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); native.handlers.clear(); native.platform = 'android';
    native.showRewarded.mockReset(); native.showRewarded.mockReturnValue(new Promise(() => {}));
    native.prepareRewarded.mockReset(); native.prepareRewarded.mockResolvedValue({});
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); native.platform = 'ios'; });

  it('uses the Android test rewarded unit and rewards exactly once', async () => {
    const { showOptionalRewarded } = await import('./admob');
    const pending = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    expect(native.prepareRewarded).toHaveBeenCalledWith(expect.objectContaining({ adId: 'ca-app-pub-3940256099942544/5224354917' }));
    expect(await showOptionalRewarded()).toBe('busy');
    emit('r_showed'); emit('r_reward'); emit('r_reward'); emit('r_dismissed');
    expect(await pending).toBe('rewarded');
  });

  it('reward arriving just after close still counts once', async () => {
    const { showOptionalRewarded } = await import('./admob');
    const pending = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    emit('r_showed'); emit('r_dismissed');
    await vi.advanceTimersByTimeAsync(300);
    emit('r_reward');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBe('rewarded');
  });

  it('early close gives no XP', async () => {
    const { showOptionalRewarded } = await import('./admob');
    const pending = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    emit('r_showed'); emit('r_dismissed');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBe('not_earned');
  });

  it('timeout → late open → earned reward gives exactly 1 XP', async () => {
    const { showOptionalRewarded, setLateRewardHandler } = await import('./admob');
    const xp = vi.fn();
    setLateRewardHandler(() => xp(1));
    const first = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await first).toBe('pending'); // no XP for the timeout itself
    expect(xp).not.toHaveBeenCalled();
    expect(await showOptionalRewarded()).toBe('busy'); // old attempt still owns the SDK
    emit('r_showed');
    await vi.advanceTimersByTimeAsync(30_000);
    emit('r_reward'); emit('r_reward'); emit('r_dismissed');
    await vi.advanceTimersByTimeAsync(2000);
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
    setLateRewardHandler(null);
  });

  it('timeout and late close without reward give no XP', async () => {
    const { showOptionalRewarded, setLateRewardHandler } = await import('./admob');
    const xp = vi.fn();
    setLateRewardHandler(xp);
    const first = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await first).toBe('pending');
    emit('r_showed'); emit('r_dismissed');
    await vi.advanceTimersByTimeAsync(2000);
    expect(xp).not.toHaveBeenCalled();
    setLateRewardHandler(null);
  });

  it('late events from an old attempt never reach the next attempt', async () => {
    const { showOptionalRewarded, setLateRewardHandler } = await import('./admob');
    const late = vi.fn();
    setLateRewardHandler(late);
    const first = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(20_000);
    await first;
    emit('r_showed'); emit('r_dismissed'); // old attempt ends without reward
    await vi.advanceTimersByTimeAsync(2000);
    const second = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    expect(native.handlers.get('r_reward')?.size).toBe(2); // old per-attempt listeners removed (1 permanent + 1 current)
    emit('r_showed'); emit('r_dismissed');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await second).toBe('not_earned');
    expect(late).not.toHaveBeenCalled();
    setLateRewardHandler(null);
  });

  it('a running ad is never cut by the open timeout', async () => {
    const { showOptionalRewarded } = await import('./admob');
    const running = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    emit('r_showed');
    await vi.advanceTimersByTimeAsync(60_000);
    emit('r_reward'); emit('r_dismissed');
    expect(await running).toBe('rewarded');
  });

  it('show error gives no XP and start ad stays away afterwards', async () => {
    native.showRewarded.mockRejectedValue(new Error('show failed'));
    const { showOptionalRewarded, showAppOpenAd } = await import('./admob');
    const pending = showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    expect(await pending).toBe('failed');
    expect(await showAppOpenAd()).toBe(false);
  });
});

describe('rewarded button status', () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); native.handlers.clear(); native.platform = 'android';
    native.showRewarded.mockReset(); native.showRewarded.mockReturnValue(new Promise(() => {}));
    native.prepareRewarded.mockReset(); native.prepareRewarded.mockResolvedValue({});
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); native.platform = 'ios'; });

  it('stays locked through loading, showing and waiting, never auto-resets', async () => {
    const m = await import('./admob');
    const seen: string[] = [];
    m.subscribeRewardedState((s) => seen.push(s));
    const p = m.showOptionalRewarded();
    expect(m.getRewardedState()).toBe('loading');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toBe('pending');
    expect(m.getRewardedState()).toBe('waiting');
    await vi.advanceTimersByTimeAsync(60 * 60_000); // an hour later: still not reset
    expect(m.getRewardedState()).toBe('waiting');
    expect(await m.showOptionalRewarded()).toBe('busy');
    expect(await m.showAppOpenAd()).toBe(false);
    emit('r_showed');
    expect(m.getRewardedState()).toBe('showing');
    emit('r_dismissed');
    await vi.advanceTimersByTimeAsync(2000);
    expect(m.getRewardedState()).toBe('idle');
    expect(seen).toEqual(['loading', 'waiting', 'showing', 'idle']);
  });

  it('show call resolving (native reward callback) counts as the single reward', async () => {
    let resolveShow: (v: unknown) => void = () => {};
    native.showRewarded.mockReturnValue(new Promise((r) => { resolveShow = r; }));
    const m = await import('./admob');
    const p = m.showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    emit('r_showed');
    resolveShow({ type: 'xp', amount: 1 });
    await vi.advanceTimersByTimeAsync(0);
    emit('r_dismissed');
    expect(await p).toBe('rewarded');
  });
});

describe('patched native rewarded (attempt ids)', () => {
  let resolveShow: (v: unknown) => void = () => {};
  const emitWith = (event: string, data: unknown) =>
    native.handlers.get(event)?.forEach((h) => (h as (d: unknown) => void)(data));
  const attemptOf = (call = 0) => (native.showRewarded.mock.calls[call] as unknown as [{ attemptId: string }])[0].attemptId;
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); native.handlers.clear(); native.platform = 'android';
    native.showRewarded.mockReset();
    native.showRewarded.mockImplementation((() => new Promise((r) => { resolveShow = r; })) as never);
    native.prepareRewarded.mockReset(); native.prepareRewarded.mockResolvedValue({});
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); native.platform = 'ios'; });

  it('reward + dismissal resolution gives exactly one reward', async () => {
    const m = await import('./admob');
    const late = vi.fn(); m.setLateRewardHandler(late);
    const p = m.showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    const aid = attemptOf();
    emitWith('r_showed', { attemptId: aid });
    emitWith('r_reward', { attemptId: aid });
    emitWith('r_dismissed', { attemptId: aid });
    resolveShow({ attemptId: aid, rewarded: true, patched: true });
    expect(await p).toBe('rewarded');
    emitWith('r_reward', { attemptId: aid });
    expect(late).not.toHaveBeenCalled();
    expect(m.getRewardedState()).toBe('idle');
  });

  it('closed unrewarded, then reward with same id → exactly 1 late XP, no time window', async () => {
    const m = await import('./admob');
    const late = vi.fn(); m.setLateRewardHandler(late);
    const p = m.showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    const aid = attemptOf();
    emitWith('r_showed', { attemptId: aid });
    emitWith('r_dismissed', { attemptId: aid });
    resolveShow({ attemptId: aid, rewarded: false, patched: true });
    expect(await p).toBe('not_earned');
    await vi.advanceTimersByTimeAsync(30_000);
    emitWith('r_reward', { attemptId: aid });
    emitWith('r_reward', { attemptId: aid });
    expect(late).toHaveBeenCalledOnce();
  });

  it('events tagged with an old attempt id never affect the next attempt', async () => {
    const m = await import('./admob');
    const late = vi.fn(); m.setLateRewardHandler(late);
    const first = m.showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    const old = attemptOf(0);
    resolveShow({ attemptId: old, rewarded: false, patched: true });
    expect(await first).toBe('not_earned');
    const second = m.showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(0);
    const cur = attemptOf(1);
    expect(cur).not.toBe(old);
    emitWith('r_showed', { attemptId: cur });
    emitWith('r_reward', { attemptId: 'someone-else' });
    emitWith('r_dismissed', { attemptId: old });
    resolveShow({ attemptId: cur, rewarded: false, patched: true });
    expect(await second).toBe('not_earned');
    expect(late).not.toHaveBeenCalled();
  });

  it('native presentation failure rejects → no XP and button freed', async () => {
    native.showRewarded.mockImplementation((() => Promise.reject(new Error('No view controller'))) as never);
    const m = await import('./admob');
    expect(await m.showOptionalRewarded()).toBe('failed');
    expect(m.getRewardedState()).toBe('idle');
  });
});

describe('preloading', () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); native.handlers.clear(); native.platform = 'ios';
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 16));
    Object.values(native.banner).forEach((f) => f.mockClear()); native.loadAppOpen.mockClear(); native.appOpenLoaded = false;
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('cold-start preload is reused by the start ad, never loaded twice', async () => {
    const m = await import('./admob');
    void m.preloadAppOpenAd();
    const shown = m.showAppOpenAd();
    await vi.advanceTimersByTimeAsync(100);
    expect(await shown).toBe(true);
    expect(native.loadAppOpen).toHaveBeenCalledOnce();
  });

  it('banner is parked between matches and resumed, not reloaded', async () => {
    const m = await import('./admob');
    const first = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await first;
    expect(native.banner.show).toHaveBeenCalledOnce();
    await m.hideGameBanner();
    expect(native.banner.hide).toHaveBeenCalledOnce();
    expect(native.banner.remove).not.toHaveBeenCalled();
    const second = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await second;
    expect(native.banner.resume).toHaveBeenCalledOnce();
    expect(native.banner.show).toHaveBeenCalledOnce();
  });

  it('a parked banner is removed after 30 minutes', async () => {
    const m = await import('./admob');
    const first = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await first;
    await m.hideGameBanner();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(native.banner.remove).toHaveBeenCalledOnce();
    const again = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await again;
    expect(native.banner.resume).not.toHaveBeenCalled();
    expect(native.banner.show).toHaveBeenCalledTimes(2);
  });
});


describe.each(['ios', 'android'])('%s banner diagnostics and recovery', (platform) => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); native.handlers.clear(); native.platform = platform;
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 16));
    Object.values(native.banner).forEach((f) => { f.mockReset(); f.mockResolvedValue(undefined); });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); native.platform = 'ios'; });

  it('logs SDK loading and impressions separately, with one listener across matches', async () => {
    const { trackEvent } = await import('@/lib/analytics');
    vi.mocked(trackEvent).mockClear();
    const m = await import('./admob');
    const first = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await first;
    expect(trackEvent).toHaveBeenCalledWith('ad_result', expect.objectContaining({ kind: 'banner', result: 'show_command_completed', loaded: false }));
    expect(vi.mocked(trackEvent).mock.calls.some(([, data]) => data?.result === 'impression')).toBe(false);
    emit('b_loaded');
    await vi.waitFor(() => expect(trackEvent).toHaveBeenCalledWith('ad_result', expect.objectContaining({ result: 'loaded' })));
    emit('b_impression');
    await vi.waitFor(() => expect(trackEvent).toHaveBeenCalledWith('ad_result', expect.objectContaining({ kind: 'banner', result: 'impression' })));
    expect(trackEvent).toHaveBeenCalledWith('ad_result', expect.objectContaining({ kind: 'banner', result: 'loaded', loaded: true }));
    expect(trackEvent).toHaveBeenCalledWith('ad_result', expect.objectContaining({ kind: 'banner', result: 'impression' }));
    await m.hideGameBanner();
    const second = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await second;
    expect(native.handlers.get('b_loaded')?.size).toBe(1);
    expect(native.handlers.get('b_impression')?.size).toBe(1);
    expect(native.banner.resume).toHaveBeenCalledOnce();
  });

  it('reloads instead of resuming a banner destroyed by an SDK load failure', async () => {
    const m = await import('./admob');
    const first = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await first;
    await m.hideGameBanner();
    native.handlers.get('b_failed')?.forEach((h) => (h as (d: unknown) => void)({ code: 3, message: 'No fill' }));
    const second = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await second;
    expect(native.banner.resume).not.toHaveBeenCalled();
    expect(native.banner.show).toHaveBeenCalledTimes(2);
  });

  it('serializes a late show, leaving the banner hidden after the screen is left', async () => {
    let finishShow: () => void = () => {};
    native.banner.show.mockImplementation(() => new Promise<void>((resolve) => { finishShow = resolve; }));
    const m = await import('./admob');
    const first = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000);
    const hidden = m.hideGameBanner();
    expect(native.banner.hide).not.toHaveBeenCalled();
    finishShow(); await first; await hidden;
    expect(native.banner.hide).toHaveBeenCalledOnce();
  });

  it('a missing native banner is freshly loaded in the same match after resume fails', async () => {
    const m = await import('./admob');
    const first = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await first;
    await m.hideGameBanner();
    native.banner.resume.mockRejectedValueOnce(new Error('resume failed'));
    const second = m.showGameBanner(); await vi.advanceTimersByTimeAsync(15_000); await second;
    expect(native.banner.show).toHaveBeenCalledTimes(2);
  });
});
