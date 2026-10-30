import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/device', () => ({ getAuthUserId: () => null, getDeviceIdSync: () => 'test-device', initDeviceId: async () => 'test-device' }));
vi.mock('@/lib/analytics-session', () => ({ getCurrentSessionId: () => 'test-session' }));
vi.mock('@/lib/session', () => ({ claimSession: async () => true }));
vi.mock('@/lib/rate-app', () => ({ markHappyMoment: vi.fn() }));
vi.mock('@/lib/app-version', () => ({ appVersionReady: Promise.resolve('5.4'), getAppVersion: () => '5.4' }));

describe('diagnostics delivery', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); localStorage.clear(); mocks.rpc.mockReset(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  it('retains evidence on failure and retries with the same event ID', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'offline' } }).mockResolvedValue({ error: null });
    const { trackEvent } = await import('./analytics');
    trackEvent('play_network_exit', { reason: 'screen_left' });
    const saved = JSON.parse(localStorage.getItem('yatzy_play_diagnostics_pending_v1') ?? '[]');
    expect(saved).toHaveLength(1);
    expect(saved[0].metadata.event_id).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1500);
    expect(JSON.parse(localStorage.getItem('yatzy_play_diagnostics_pending_v1') ?? '[]')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    const first = mocks.rpc.mock.calls[0][1].p_events[0];
    const second = mocks.rpc.mock.calls[1][1].p_events[0];
    expect(first.metadata.event_id).toBe(second.metadata.event_id);
    expect(first.platform).toBe('web');
    expect(JSON.parse(localStorage.getItem('yatzy_play_diagnostics_pending_v1') ?? '[]')).toEqual([]);
  });
  it('restores unsent events after restart and preserves their original timestamp/version', async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    localStorage.setItem('yatzy_play_diagnostics_pending_v1', JSON.stringify([{ event_name: 'play_first_action', metadata: { event_id: 'saved-id', occurred_at: '2026-10-30T10:00:00Z' }, platform: 'ios', app_version: '5.3', session_id: 'old-session' }]));
    await import('./analytics');
    await vi.advanceTimersByTimeAsync(1500);
    expect(mocks.rpc.mock.calls[0][1].p_events[0]).toEqual(expect.objectContaining({ app_version: '5.3', platform: 'ios', metadata: { event_id: 'saved-id', occurred_at: '2026-10-30T10:00:00Z' } }));
    expect(JSON.parse(localStorage.getItem('yatzy_play_diagnostics_pending_v1') ?? '[]')).toEqual([]);
  });
});