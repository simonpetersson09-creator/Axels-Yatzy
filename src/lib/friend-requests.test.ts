import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), claim: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'sender', requireClaimedDevice: mocks.claim }));
vi.mock('@/lib/device', () => ({ initDeviceId: async () => 'device', getDeviceIdSync: () => 'device' }));
vi.mock('@/lib/known-friends', () => ({ addKnownFriends: vi.fn() }));
import { cancelFriendRequest } from './friend-requests';
beforeEach(() => { mocks.rpc.mockReset(); mocks.claim.mockReset().mockResolvedValue('device'); });
it('cancels the sent pending request using the sender device', async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: true } });
  expect(await cancelFriendRequest({ id: 'request', incoming: false, otherId: 'halmia', otherName: 'Halmia', status: 'pending' })).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith('cancel_friend_request', { p_id: 'request', p_session_id: 'sender', p_device_id: 'device' });
});
it('does not report cancellation when the server refuses it', async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: false } });
  expect(await cancelFriendRequest({ id: 'request', incoming: false, otherId: 'halmia', otherName: 'Halmia', status: 'accepted' })).toBe(false);
});
it('does not cancel when device registration fails', async () => {
  mocks.claim.mockRejectedValue(new Error('offline'));
  expect(await cancelFriendRequest({ id: 'request', incoming: false, otherId: 'halmia', otherName: 'Halmia', status: 'pending' })).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});