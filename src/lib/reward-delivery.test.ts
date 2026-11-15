import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('./device', () => ({ initDeviceId: async () => 'device-a', getDeviceIdSync: () => 'device-a' }));
vi.mock('./session', () => ({ getSessionId: () => 'session-a', claimSession: async () => true }));
import { reportLocalYatzyMatch } from './gold-dice';
import { flushAdRewardReceipts } from './ad-reward-delivery';
import { saveAdRewardReceipt, readAdRewardReceipts } from './ad-reward-receipts';
import { forgetRecoverableWrites, retryRecoverableWrites } from './recoverable-storage';
beforeEach(() => { forgetRecoverableWrites(); localStorage.clear(); sessionStorage.clear(); mocks.rpc.mockReset(); });
it('retains rejected Yatzy reports and more than 20 offline matches until confirmed', async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: false }, error: null });
  for (let i=0; i<25; i++) expect(await reportLocalYatzyMatch(`match-${i}`)).toBe(false);
  expect(JSON.parse(localStorage.getItem('mrb_pending_yatzy_v1') ?? '[]')).toHaveLength(25);
  mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  expect(await reportLocalYatzyMatch('match-0')).toBe(true);
  expect(JSON.parse(localStorage.getItem('mrb_pending_yatzy_v1') ?? '[]')).toEqual([]);
});
it('saves confirmed XP before sending and retries the same receipt after a lost reply', async () => {
  const id = 'eaf1264e-0704-40eb-90b9-d8a8257d7ba6';
  expect(saveAdRewardReceipt(id)).toBe(true);
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'lost reply' } }).mockResolvedValue({ data: { ok: true, duplicate: true, xp: 8, earned_today: 1 }, error: null });
  await flushAdRewardReceipts();
  expect(readAdRewardReceipts()).toHaveLength(1);
  const paid = vi.fn();
  await flushAdRewardReceipts(paid);
  expect(readAdRewardReceipts()).toEqual([]);
  expect(mocks.rpc.mock.calls.map(c => c[1].p_attempt_id)).toEqual([id,id]);
  expect(paid).not.toHaveBeenCalled();
});
it('retains unpaid cooldown receipts and pays 1 XP once, never another ad', async () => {
  saveAdRewardReceipt('eaf1264e-0704-40eb-90b9-d8a8257d7ba6');
  mocks.rpc.mockResolvedValueOnce({ data: { ok: false, reason: 'cooldown' }, error: null }).mockResolvedValue({ data: { ok: true, xp: 9, earned_today: 2 }, error: null });
  const paid = vi.fn();
  await flushAdRewardReceipts(paid);
  expect(readAdRewardReceipts()).toHaveLength(1);
  await flushAdRewardReceipts(paid);
  await flushAdRewardReceipts(paid);
  expect(paid).toHaveBeenCalledExactlyOnceWith(1);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it('never sends a saved reward belonging to another device', async () => {
  localStorage.setItem('mrb_ad_reward_receipts_v1', JSON.stringify([{ id: 'id', sessionId: 'session-a', deviceId: 'other' }]));
  await flushAdRewardReceipts();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(readAdRewardReceipts()).toHaveLength(1);
});

it('delivers confirmed 1 XP even with both stores blocked and never replays it after recovery', async () => {
  const id = 'eaf1264e-0704-40eb-90b9-d8a8257d7ba6';
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(saveAdRewardReceipt(id)).toBe(true);
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
  await flushAdRewardReceipts();
  expect(readAdRewardReceipts().map(r => r.id)).toEqual([id]);
  mocks.rpc.mockResolvedValue({ data: { ok: true, xp: 9, earned_today: 2 }, error: null });
  const paid = vi.fn(); await flushAdRewardReceipts(paid);
  expect(paid).toHaveBeenCalledExactlyOnceWith(1);
  spy.mockRestore(); retryRecoverableWrites(); await flushAdRewardReceipts(paid);
  expect(readAdRewardReceipts()).toEqual([]);
  expect(mocks.rpc.mock.calls.map(c => c[1].p_attempt_id)).toEqual([id, id]);
});