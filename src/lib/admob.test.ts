import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ platform: 'ios', handlers: new Map<string, Set<() => void>>(), show: vi.fn(async () => {}), showRewarded: vi.fn(async () => ({})), prepareRewarded: vi.fn(async () => ({})) }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => native.platform, isNativePlatform: () => true, isPluginAvailable: () => true,
} }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  InterstitialAdPluginEvents: { Dismissed: 'dismissed', FailedToShow: 'failed' },
  RewardAdPluginEvents: { Showed: 'r_showed', Rewarded: 'r_reward', Dismissed: 'r_dismissed', FailedToShow: 'r_failed' },
  AdMob: {
    requestConsentInfo: async () => ({ canRequestAds: true }),
    initialize: async () => {}, prepareInterstitial: async () => {}, showInterstitial: native.show,
    prepareRewardVideoAd: native.prepareRewarded, showRewardVideoAd: native.showRewarded,
    isAppOpenLoaded: async () => ({ value: true }), loadAppOpen: async () => {}, showAppOpen: async () => {},
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
    native.showRewarded.mockClear(); native.prepareRewarded.mockReset(); native.prepareRewarded.mockResolvedValue({});
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
    native.showRewarded.mockReset(); native.showRewarded.mockResolvedValue({});
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
    expect(await first).toBe('failed'); // button freed, no XP for the timeout itself
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
    expect(await first).toBe('failed');
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
    expect(native.handlers.get('r_reward')?.size).toBe(1); // old listeners removed
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
