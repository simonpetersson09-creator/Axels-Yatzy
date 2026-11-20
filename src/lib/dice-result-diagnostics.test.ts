import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: m.track }));
import { observeDiceResult } from './dice-result-diagnostics';
beforeEach(() => {
  vi.useFakeTimers(); m.track.mockReset();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('measures the observed six-second extra wait separately from the 10.6-second response', async () => {
  const d = observeDiceResult('slow-game', 'attempt');
  await vi.advanceTimersByTimeAsync(10600); d.received('rpc');
  await vi.advanceTimersByTimeAsync(5900); d.landingSignal('recovery');
  expect(m.track).toHaveBeenCalledWith('play_dice_result_timing', expect.objectContaining({
    result_received_ms: 10600, result_to_landing_signal_ms: 5900,
    landing_signal_ms: 16500, first_result_source: 'rpc', result_source: 'recovery',
    boundary: 'dice_await_released', cause_confirmed: false,
  }), { gameId: 'slow-game', gameMode: 'multiplayer' });
  d.landingSignal('rpc'); expect(m.track).toHaveBeenCalledTimes(1);
});
it('keeps fast normal direct results out of diagnostics and admin issues', async () => {
  const d = observeDiceResult('normal-game', 'attempt');
  await vi.advanceTimersByTimeAsync(200); d.received('rpc'); d.landingSignal('rpc');
  expect(m.track).not.toHaveBeenCalled();
});
it('reports a recovery without values, names, inputs or network identifiers', async () => {
  const d = observeDiceResult('recovery-game', 'attempt');
  await vi.advanceTimersByTimeAsync(500); d.received('recovery'); d.landingSignal('recovery');
  expect(m.track.mock.calls[0]?.[1]).toEqual({ attempt_id: 'attempt', result_source: 'recovery', first_result_source: 'recovery',
    result_received_ms: 500, result_to_landing_signal_ms: 0, landing_signal_ms: 500,
    boundary: 'dice_await_released', background_seen: false, offline_hint_seen: false,
    visibility_changes: 0, connectivity_changes: 0, cause_confirmed: false });
  expect(m.track.mock.calls[0]?.[0]).not.toBe('mp_issue');
});
it('observes background and offline signals without claiming their cause', () => {
  const d = observeDiceResult('signals-game', 'attempt');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  window.dispatchEvent(new Event('offline'));
  d.received('rpc'); d.landingSignal('rpc');
  expect(m.track.mock.calls[0]?.[1]).toMatchObject({ background_seen: true, offline_hint_seen: true,
    visibility_changes: 1, connectivity_changes: 1, cause_confirmed: false });
});
it('cancels on departure and detaches listeners even if logging throws', () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const d = observeDiceResult('cancel-game', 'attempt'); d.cancel();
  d.received('rpc'); d.landingSignal('recovery');
  expect(m.track).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  m.track.mockImplementation(() => { throw new Error('logger'); });
  const other = observeDiceResult('throw-game', 'attempt'); other.received('recovery');
  expect(() => other.landingSignal('recovery')).not.toThrow();
});
it('limits extra diagnostics to eight reports per match', () => {
  for (let i = 0; i < 12; i++) {
    const d = observeDiceResult('capped-game', String(i)); d.received('recovery'); d.landingSignal('recovery');
  }
  expect(m.track).toHaveBeenCalledTimes(8);
});