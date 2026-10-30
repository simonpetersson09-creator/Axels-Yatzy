import { renderHook, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/analytics', () => analytics);
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
import { usePlayNetworkDiagnostics } from './usePlayNetworkDiagnostics';
describe('network exit diagnostics', () => {
  beforeEach(() => { analytics.trackEvent.mockClear(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); });
  afterEach(cleanup);
  it('logs leaving with an observed error without claiming causation', () => {
    const hook = renderHook(() => usePlayNetworkDiagnostics('match', 'playing', true, false));
    hook.unmount();
    expect(analytics.trackEvent).toHaveBeenCalledWith('play_network_exit', expect.objectContaining({ reason: 'screen_left', cause_confirmed: false, error_visible: true }), { gameId: 'match', gameMode: 'multiplayer' });
  });
  it('logs offline/recovery transitions only once and no exit after recovery', () => {
    const hook = renderHook(() => usePlayNetworkDiagnostics('match', 'playing', false, false));
    act(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('offline')); });
    expect(analytics.trackEvent.mock.calls.filter(([event]) => event === 'play_network_issue')).toHaveLength(1);
    act(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); window.dispatchEvent(new Event('online')); });
    hook.unmount();
    expect(analytics.trackEvent.mock.calls.filter(([event]) => event === 'play_network_recovered')).toHaveLength(1);
    expect(analytics.trackEvent.mock.calls.filter(([event]) => event === 'play_network_exit')).toHaveLength(0);
  });
  it('does not count a completed match as a network exit', () => {
    const hook = renderHook(() => usePlayNetworkDiagnostics('match', 'finished', true, false));
    hook.unmount();
    expect(analytics.trackEvent.mock.calls.filter(([event]) => event === 'play_network_exit')).toHaveLength(0);
  });
  it('logs slow response and clears it when confirmation arrives', () => {
    const hook = renderHook(({ slow }) => usePlayNetworkDiagnostics('match', 'playing', false, slow), { initialProps: { slow: false } });
    hook.rerender({ slow: true });
    hook.rerender({ slow: false });
    expect(analytics.trackEvent).toHaveBeenCalledWith('play_network_issue', expect.objectContaining({ reason: 'slow_response' }), expect.anything());
    expect(analytics.trackEvent).toHaveBeenCalledWith('play_network_recovered', expect.objectContaining({ reason: 'signals_cleared' }), expect.anything());
  });
});