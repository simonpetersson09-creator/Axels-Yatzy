import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), device: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/device', () => ({ initDeviceId: mocks.device }));

beforeEach(() => {
  vi.resetModules(); vi.useRealTimers(); mocks.rpc.mockReset();
  mocks.device.mockReset().mockResolvedValue('device');
  localStorage.setItem('yatzy_session_id', 'player');
});

it('shares a pending claim and waits for confirmation before returning the device', async () => {
  let resolveClaim: (value: unknown) => void = () => {};
  mocks.rpc.mockImplementation(() => new Promise(resolve => { resolveClaim = resolve; }));
  const { requireClaimedDevice } = await import('./session');
  let finished = false;
  const a = requireClaimedDevice().then(value => { finished = true; return value; });
  const b = requireClaimedDevice();
  await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
  expect(finished).toBe(false);
  expect(mocks.rpc).toHaveBeenCalledWith('claim_session', { p_session_id: 'player', p_device_id: 'device' });
  resolveClaim({ data: true, error: null });
  expect(await a).toBe('device'); expect(await b).toBe('device');
});

it.each([{ data: false, error: null }, { data: null, error: new Error('offline') }])('retries unsuccessful registration on the next action (%j)', async failure => {
  mocks.rpc.mockResolvedValueOnce(failure).mockResolvedValueOnce({ data: true });
  const { requireClaimedDevice } = await import('./session');
  await expect(requireClaimedDevice()).rejects.toThrow('session not ready');
  expect(await requireClaimedDevice()).toBe('device');
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});

it('reclaims when the local player identity changes', async () => {
  mocks.rpc.mockResolvedValue({ data: true });
  const { requireClaimedDevice } = await import('./session');
  await requireClaimedDevice(); await requireClaimedDevice();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  localStorage.setItem('yatzy_session_id', 'new-player');
  await requireClaimedDevice();
  expect(mocks.rpc).toHaveBeenLastCalledWith('claim_session', { p_session_id: 'new-player', p_device_id: 'device' });
});

it('times out without letting a hung registration release an action', async () => {
  vi.useFakeTimers(); mocks.rpc.mockImplementation(() => new Promise(() => {}));
  const { requireClaimedDevice } = await import('./session');
  const outcome = expect(requireClaimedDevice()).rejects.toThrow('session not ready');
  await vi.advanceTimersByTimeAsync(5000); await outcome;
  vi.useRealTimers();
});