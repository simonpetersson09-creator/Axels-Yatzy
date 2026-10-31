import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const n = vi.hoisted(() => ({
  platform: 'ios', interstitial: vi.fn(), rewarded: vi.fn(), show: vi.fn(), eligible: true,
  events: new Map<string, Set<(data?: unknown) => void>>(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => n.platform, isNativePlatform: () => true, isPluginAvailable: () => true,
} }));
vi.mock('./local-stats', () => ({ getRankedGames: () => 1 }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  InterstitialAdPluginEvents: { Dismissed: 'dismiss', FailedToShow: 'fail' },
  RewardAdPluginEvents: { Rewarded: 'reward', Showed: 'opened', Dismissed: 'r_dismiss', FailedToShow: 'r_fail' },
  AdMob: {
    requestConsentInfo: async () => ({ canRequestAds: n.eligible }), initialize: async () => {},
    trackingAuthorizationStatus: async () => ({ status: 'denied' }),
    discardPrivacyCaches: async () => ({ privacyCacheVersion: 1 }), showPrivacyOptionsForm: async () => {},
    prepareInterstitial: n.interstitial, prepareRewardVideoAd: n.rewarded,
    showInterstitial: n.show, showRewardVideoAd: n.show,
    addListener: async (event: string, callback: (data?: unknown) => void) => {
      const handlers = n.events.get(event) ?? new Set(); handlers.add(callback); n.events.set(event, handlers);
      return { remove: async () => { handlers.delete(callback); } };
    },
  },
}));
function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const emit = (event: string) => n.events.get(event)?.forEach(fn => fn());

describe.each(['ios', 'android'])('%s fullscreen SDK load ownership', platform => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); n.platform = platform; n.eligible = true; n.events.clear();
    n.interstitial.mockReset().mockResolvedValue({}); n.rewarded.mockReset().mockResolvedValue({});
    n.show.mockReset().mockReturnValue(new Promise(() => {}));
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  describe.each(['interstitial', 'rewarded'] as const)('%s', format => {
    const timeout = () => format === 'rewarded' && platform === 'android' ? 20_000 : 10_000;
    const load = async () => {
      const m = await import('./admob');
      return format === 'rewarded' ? m.preloadRewarded() : m.preloadInterstitial();
    };
    it.each(['success', 'error'])('timeout then reuse until a late %s, without extra SDK requests or presentation', async outcome => {
      const pending = deferred(); n[format].mockReturnValueOnce(pending.promise);
      const first = load(); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(timeout()); expect(await first).toBe(false);
      const second = load(); await vi.advanceTimersByTimeAsync(0); expect(n[format]).toHaveBeenCalledOnce();
      if (outcome === 'success') pending.resolve(); else pending.reject(new Error('sdk failed'));
      expect(await second).toBe(outcome === 'success'); expect(n.show).not.toHaveBeenCalled();
      expect(await load()).toBe(true);
      expect(n[format]).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 2);
    });
    it('never blindly unlocks a permanently unanswered SDK attempt', async () => {
      n[format].mockReturnValueOnce(new Promise(() => {}));
      const first = load(); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(timeout()); expect(await first).toBe(false);
      await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
      const next = load(); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(timeout()); expect(await next).toBe(false);
      expect(n[format]).toHaveBeenCalledOnce(); expect(n.show).not.toHaveBeenCalled();
    });
    it.each(['success', 'error'])('old %s cannot release a replacement owner or remove its cache', async outcome => {
      const old = deferred(); const current = deferred(); n[format].mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      const m = await import('./admob');
      const first = load(); await vi.advanceTimersByTimeAsync(0);
      expect(await m.showAdPrivacyOptions()).toBe(true);
      const replacement = load(); await vi.advanceTimersByTimeAsync(0);
      if (outcome === 'success') old.resolve(); else old.reject(new Error('old sdk failed'));
      expect(await first).toBe(false);
      const reuse = load(); await vi.advanceTimersByTimeAsync(0); expect(n[format]).toHaveBeenCalledTimes(2);
      current.resolve(); expect(await replacement).toBe(true); expect(await reuse).toBe(true);
      expect(await load()).toBe(true); expect(n[format]).toHaveBeenCalledTimes(2);
    });
    it.each(['success', 'error'])('old %s after replacement success preserves usable cache', async outcome => {
      const old = deferred(); n[format].mockReturnValueOnce(old.promise);
      const m = await import('./admob'); const first = load(); await vi.advanceTimersByTimeAsync(0);
      await m.showAdPrivacyOptions(); expect(await load()).toBe(true);
      if (outcome === 'success') old.resolve(); else old.reject(new Error('old sdk failed'));
      expect(await first).toBe(false); expect(await load()).toBe(true); expect(n[format]).toHaveBeenCalledTimes(2);
    });
  });
  it.each(['failure', 'timeout'])('XP %s does not immediately reload, and late load cannot present automatically', async outcome => {
    const pending = deferred();
    n.rewarded.mockImplementationOnce(() => outcome === 'failure' ? Promise.reject(new Error('no fill')) : pending.promise);
    const m = await import('./admob'); const show = m.showOptionalRewarded();
    await vi.advanceTimersByTimeAsync(platform === 'android' ? 20_000 : 10_000);
    expect(await show).toBe('failed'); expect(n.rewarded).toHaveBeenCalledOnce(); expect(n.show).not.toHaveBeenCalled();
    expect(m.getRewardedState()).toBe('idle');
    pending.resolve(); await vi.advanceTimersByTimeAsync(0);
    expect(n.show).not.toHaveBeenCalled(); expect(n.rewarded).toHaveBeenCalledOnce();
  });
  it('consumed XP ad reloads once; duplicated SDK reward yields one reward', async () => {
    const m = await import('./admob'); const xp = vi.fn();
    const show = m.showOptionalRewarded().then(result => { if (result === 'rewarded') xp(1); return result; });
    await vi.advanceTimersByTimeAsync(0); emit('opened'); emit('reward'); emit('reward'); emit('r_dismiss');
    expect(await show).toBe('rewarded'); await vi.advanceTimersByTimeAsync(0);
    expect(xp).toHaveBeenCalledExactlyOnceWith(1); expect(n.rewarded).toHaveBeenCalledTimes(2);
  });
  it('post-match skips pending cache, and dismissal retains exactly one replacement', async () => {
    const m = await import('./admob'); await m.preloadInterstitial();
    const show = m.showPostMatchInterstitial(); await vi.advanceTimersByTimeAsync(0);
    emit('dismiss'); expect(await show).toBe('shown'); await vi.advanceTimersByTimeAsync(0);
    expect(n.interstitial).toHaveBeenCalledTimes(2);
    expect(await m.preloadInterstitial()).toBe(true); expect(n.interstitial).toHaveBeenCalledTimes(2);
  });
});