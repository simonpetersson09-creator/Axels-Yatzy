import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), device: vi.fn(), shop: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'self', requireClaimedDevice: mocks.device }));
vi.mock('@/lib/dice-shop', () => ({ fetchShop: mocks.shop }));
import { fetchWeeklyRewards, acknowledgeWeeklyRewards } from './weekly-rewards';
beforeEach(() => { vi.clearAllMocks(); mocks.device.mockResolvedValue('device'); });
it('reads both server prizes and refreshes the wallet without awarding client XP', async () => {
  const rewards = [{ week_start: '2026-10-26', list: 'score', rank: 1, xp: 3 }, { week_start: '2026-10-26', list: 'games', rank: 2, xp: 2 }];
  mocks.rpc.mockResolvedValue({ data: { ok: true, rewards }, error: null });
  expect(await fetchWeeklyRewards()).toEqual(rewards);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_weekly_xp_rewards', { p_session_id: 'self', p_device_id: 'device' });
  expect(mocks.shop).toHaveBeenCalledTimes(1);
});
it('does not confuse a failed read with no prize', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
  expect(await fetchWeeklyRewards()).toBeNull();
  expect(mocks.shop).not.toHaveBeenCalled();
});
it('keeps the receipt pending when acknowledgement fails', async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  expect(await acknowledgeWeeklyRewards('2026-10-26')).toBe(false);
  expect(mocks.rpc).toHaveBeenCalledWith('ack_weekly_xp_rewards', { p_session_id: 'self', p_device_id: 'device', p_week_start: '2026-10-26' });
});