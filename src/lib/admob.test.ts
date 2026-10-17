import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ handlers: new Map<string, Set<() => void>>(), show: vi.fn(async () => {}) }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => 'ios', isNativePlatform: () => true, isPluginAvailable: () => true,
} }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  InterstitialAdPluginEvents: { Dismissed: 'dismissed', FailedToShow: 'failed' },
  AdMob: {
    requestConsentInfo: async () => ({ canRequestAds: true }),
    initialize: async () => {}, prepareInterstitial: async () => {}, showInterstitial: native.show,
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
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); native.handlers.clear(); native.show.mockClear(); });
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