import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: m.track }));
import { measureRecoveryRead } from './multiplayer-recovery-diagnostics';
const context = { gameId: 'game', attemptId: 'attempt', readIndex: 1 };
beforeEach(() => { vi.useFakeTimers(); m.track.mockReset(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('measures the existing read and never logs returned dice or identities', async () => {
  const response = { data: { dice: [6,6,6,6,6], session_id: 'private-player' }, error: null };
  const read = vi.fn(() => new Promise<typeof response>(resolve => setTimeout(() => resolve(response), 1400)));
  const pending = measureRecoveryRead(read, context);
  await vi.advanceTimersByTimeAsync(1400);
  expect(await pending).toBe(response);
  expect(read).toHaveBeenCalledTimes(1);
  expect(m.track).toHaveBeenCalledWith('play_recovery_timing', { attempt_id: 'attempt', read_index: 1, read_ms: 1400, outcome: 'response', cause_confirmed: false }, { gameId: 'game', gameMode: 'multiplayer' });
  expect(JSON.stringify(m.track.mock.calls)).not.toContain('private-player');
  expect(m.track.mock.calls[0]?.[1]).not.toHaveProperty('dice');
});
it.each(['timeout', 'Load failed'])('measures %s and preserves rejection without retrying', async message => {
  const error = new Error(message);
  const read = vi.fn(() => new Promise<never>((_, reject) => setTimeout(() => reject(error), 5000)));
  const pending = measureRecoveryRead(read, context);
  const rejection = expect(pending).rejects.toBe(error);
  await vi.advanceTimersByTimeAsync(5000); await rejection;
  expect(read).toHaveBeenCalledTimes(1);
  expect(m.track).toHaveBeenCalledWith('play_recovery_timing', expect.objectContaining({ outcome: message === 'timeout' ? 'deadline' : 'error', read_ms: 5000 }), expect.anything());
});
it('recognizes a returned database error and cannot disrupt gameplay if logging throws', async () => {
  const response = { data: null, error: { message: 'private-error' } };
  m.track.mockImplementation(() => { throw new Error('logger failed'); });
  expect(await measureRecoveryRead(async () => response, context)).toBe(response);
  expect(m.track).toHaveBeenCalledWith('play_recovery_timing', expect.objectContaining({ outcome: 'error' }), expect.anything());
  expect(JSON.stringify(m.track.mock.calls)).not.toContain('private-error');
});