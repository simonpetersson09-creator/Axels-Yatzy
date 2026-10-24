import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ claim: vi.fn(), rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/session', () => ({ requireClaimedDevice: mocks.claim }));
vi.mock('@/lib/i18n', () => ({ t: () => 'Connection failed' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }));
import { directRpc, invokeDeviceAction } from './multiplayer-actions';
beforeEach(() => {
  mocks.claim.mockReset(); mocks.rpc.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  mocks.invoke.mockReset().mockResolvedValue({ data: { success: true }, error: null });
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