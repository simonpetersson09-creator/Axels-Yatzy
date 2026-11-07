import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ claim: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: mocks.track }));
vi.mock('@/lib/session', () => ({ requireClaimedDevice: mocks.claim }));
vi.mock('@/lib/i18n', () => ({ t: () => 'Connection failed' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }));
import { directRpc, invokeDeviceAction } from './multiplayer-actions';
beforeEach(() => {
  mocks.claim.mockReset(); mocks.rpc.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  mocks.invoke.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  mocks.track.mockReset();
});
it.each(['client_roll', 'client_set_locks', 'client_set_locks_guarded', 'client_submit_score', 'client_start_game'] as const)('%s sends nothing until registration succeeds', async rpc => {
  let release: (value: string) => void = () => {};
  mocks.claim.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const result = directRpc(rpc, 'fallback', { p_game_id: 'game', p_session_id: 'player' }, {});
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled();
  release('device'); expect((await result).error).toBeNull();
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(rpc, { p_game_id: 'game', p_session_id: 'player', p_device_id: 'device' });
});
it('refused registration blocks direct and function actions without a legacy fallback', async () => {
  mocks.claim.mockRejectedValue(new Error('offline'));
  expect((await directRpc('client_roll', 'roll-dice', {}, {})).error).toBeInstanceOf(Error);
  await expect(invokeDeviceAction('forfeit-game', {})).rejects.toThrow('offline');
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled();
});
it('forfeit waits and sends the confirmed device', async () => {
  let release: (value: string) => void = () => {};
  mocks.claim.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const result = invokeDeviceAction('forfeit-game', { game_id: 'game', session_id: 'player' });
  expect(mocks.invoke).not.toHaveBeenCalled(); release('device'); await result;
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('forfeit-game', { body: { game_id: 'game', session_id: 'player', device_id: 'device' } });
});
it('records a slow raw response with the same attempt ID, including after UI recovery', async () => {
  vi.useFakeTimers();
  try {
    mocks.claim.mockResolvedValue('device');
    mocks.rpc.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ data: { success: true, server_ms: 100, dice: [1,2,3,4,5] }, error: null }), 3400)));
    const pending = directRpc('client_roll', 'roll-dice', { p_game_id: 'game' }, {}, { attemptId: 'attempt' });
    await vi.advanceTimersByTimeAsync(3400);
    expect((await pending).data.dice).toEqual([1,2,3,4,5]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith('play_roll_timing', expect.objectContaining({ attempt_id: 'attempt', ok: true, total_ms: 3400, server_ms: 100, outside_server_ms: 3300 }), { gameId: 'game', gameMode: 'multiplayer' });
    expect(mocks.rpc).toHaveBeenCalledWith('client_roll_diagnosed', { p_game_id: 'game', p_device_id: 'device', p_attempt_id: 'attempt' });
  } finally { vi.useRealTimers(); }
});
it('does not log fast successes or create a diagnostic server request', async () => {
  mocks.claim.mockResolvedValue('device');
  await directRpc('client_roll', 'roll-dice', {}, {});
  expect(mocks.track).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('records lock duration and correlation without lock values or identities', async () => {
  vi.useFakeTimers();
  try {
    mocks.claim.mockResolvedValue('private-device');
    mocks.rpc.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ data: { success: true, server_ms: 150 }, error: null }), 3500)));
    const pending = directRpc('client_set_locks_guarded', 'toggle-lock', { p_game_id: 'game', p_session_id: 'private-player', p_locked: [true,false,false,false,false] }, {}, { attemptId: 'lock-attempt' });
    await vi.advanceTimersByTimeAsync(3500);
    expect((await pending).error).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith('client_set_locks_diagnosed', expect.objectContaining({ p_attempt_id: 'lock-attempt', p_device_id: 'private-device' }));
    expect(mocks.track).toHaveBeenCalledWith('play_lock_timing', expect.objectContaining({ attempt_id: 'lock-attempt', total_ms: 3500, server_ms: 150, outside_server_ms: 3350 }), { gameId: 'game', gameMode: 'multiplayer' });
    const metadata = mocks.track.mock.calls[0]?.[1];
    expect(metadata).not.toHaveProperty('p_locked');
    expect(JSON.stringify(metadata)).not.toContain('private-device');
    expect(JSON.stringify(metadata)).not.toContain('private-player');
  } finally { vi.useRealTimers(); }
});
it('preserves a stale lock response so the caller refreshes instead of confirming it', async () => {
  mocks.claim.mockResolvedValue('device');
  mocks.rpc.mockResolvedValue({ data: { success: false, stale_command: true, error: 'stale lock command', server_ms: 2 }, error: null });
  const result = await directRpc('client_set_locks_guarded', 'toggle-lock', {}, {});
  expect(result.data.stale_command).toBe(true);
  expect(result.error).toBeInstanceOf(Error);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('logs a missing response at the deadline, then correlates a late answer without resending', async () => {
  vi.useFakeTimers();
  try {
    mocks.claim.mockResolvedValue('device');
    let release: (value: unknown) => void = () => {};
    mocks.rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = directRpc('client_roll', 'roll-dice', { p_game_id: 'game' }, {}, { attemptId: 'missing', timeoutAfterMs: 8000 });
    await vi.advanceTimersByTimeAsync(7999);
    expect(mocks.track).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.track).toHaveBeenCalledWith('play_roll_timing', expect.objectContaining({ attempt_id: 'missing', stage: 'deadline', total_ms: 8000, response_received: false, server_ms: null }), expect.anything());
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    release({ data: { success: true, server_ms: 1 }, error: null });
    await pending;
    expect(mocks.track).toHaveBeenLastCalledWith('play_roll_timing', expect.objectContaining({ attempt_id: 'missing', stage: 'response', response_received: true, server_ms: 1 }), expect.anything());
    await vi.advanceTimersByTimeAsync(16000);
    expect(mocks.track).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});
it('clears the deadline observer on a fast lock response', async () => {
  vi.useFakeTimers();
  try {
    mocks.claim.mockResolvedValue('device');
    await directRpc('client_set_locks_guarded', 'toggle-lock', {}, {}, { attemptId: 'fast', timeoutAfterMs: 12000 });
    await vi.advanceTimersByTimeAsync(12000);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});
it('records a claim stalled at the deadline without saying the request was dispatched', async () => {
  vi.useFakeTimers();
  try {
    let release: (value: string) => void = () => {};
    mocks.claim.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = directRpc('client_roll', 'roll-dice', {}, {}, { attemptId: 'claim', timeoutAfterMs: 8000 });
    await vi.advanceTimersByTimeAsync(8000);
    expect(mocks.track).toHaveBeenCalledWith('play_roll_timing', expect.objectContaining({ stage: 'deadline', request_dispatched: false, claim_ms: 8000, request_ms: 0 }), expect.anything());
    expect(mocks.rpc).not.toHaveBeenCalled();
    release('device'); await pending;
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});