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
it.each(['client_roll', 'client_set_locks', 'client_submit_score', 'client_start_game'] as const)('%s sends nothing until registration succeeds', async rpc => {
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
  } finally { vi.useRealTimers(); }
});
it('does not log fast successes or create a diagnostic server request', async () => {
  mocks.claim.mockResolvedValue('device');
  await directRpc('client_roll', 'roll-dice', {}, {});
  expect(mocks.track).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});