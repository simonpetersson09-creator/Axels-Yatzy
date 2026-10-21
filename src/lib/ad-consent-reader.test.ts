import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), track: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  isNativePlatform: () => true, isPluginAvailable: () => true, getPlatform: () => 'ios',
} }));
vi.mock('@capacitor-community/admob', () => ({ AdMob: { getStoredConsentChoices: mocks.read } }));
vi.mock('@/lib/analytics', () => ({ trackEvent: mocks.track }));

describe('native consent reader diagnostics', () => {
  beforeEach(() => { vi.resetModules(); mocks.read.mockReset(); mocks.track.mockReset(); vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  it('reads choices without sending them to analytics', async () => {
    mocks.read.mockResolvedValue({ status: 'OBTAINED', purposeConsents: '1101' });
    const { getAdConsentChoices } = await import('./admob');
    expect(await getAdConsentChoices()).toEqual({ storage: 'allowed', adProfile: 'denied', useAdProfile: 'allowed' });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('ad_consent_read', { result: 'read_ok' });
  });
  it.each([
    ['UNIMPLEMENTED', 'native method not implemented', 'reader_unavailable'],
    ['OTHER', 'private payload must not be logged', 'read_failed'],
  ])('classifies %s without copying error details', async (code, message, result) => {
    mocks.read.mockRejectedValue({ code, message });
    const { getAdConsentChoices } = await import('./admob');
    expect(await getAdConsentChoices()).toEqual({ storage: 'unknown', adProfile: 'unknown', useAdProfile: 'unknown' });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('ad_consent_read', { result });
  });
  it('reports missing data without inferring refusal', async () => {
    mocks.read.mockResolvedValue({ status: 'OBTAINED', purposeConsents: '' });
    const { getAdConsentChoices } = await import('./admob');
    expect((await getAdConsentChoices()).storage).toBe('unknown');
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('ad_consent_read', { result: 'data_unavailable' });
  });
  it('limits a stalled native read to five seconds', async () => {
    mocks.read.mockReturnValue(new Promise(() => {}));
    const { getAdConsentChoices } = await import('./admob');
    const pending = getAdConsentChoices();
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await pending).storage).toBe('unknown');
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('ad_consent_read', { result: 'read_timeout' });
  });
});