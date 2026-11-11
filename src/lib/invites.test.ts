import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ claim: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/session', () => ({ requireClaimedDevice: mocks.claim, getSessionId: () => 'player', getPlayerName: () => 'Simon' }));
vi.mock('@/lib/i18n', () => ({ t: () => 'Connection failed' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { sendInvite, respondInvite, sendLobbyInvites } from './invites';
beforeEach(() => { mocks.claim.mockReset(); mocks.invoke.mockReset().mockResolvedValue({ data: { success: true, game_id: 'game' } }); });
it('invite reply waits for a confirmed device before accepting', async () => {
  let release: (value: string) => void = () => {};
  mocks.claim.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const pending = respondInvite({ inviteId: 'invite', action: 'accept' });
  expect(mocks.invoke).not.toHaveBeenCalled(); release('device');
  expect(await pending).toEqual({ ok: true, gameId: 'game' });
  expect(mocks.invoke).toHaveBeenCalledWith('respond-invite', { body: { invite_id: 'invite', session_id: 'player', action: 'accept', device_id: 'device' } });
});
it('sends two friends in one device-checked request to the created game', async () => {
  mocks.claim.mockResolvedValue('device');
  expect((await sendLobbyInvites('created-game', ['friend-one', 'friend-two'])).ok).toBe(true);
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('send-invite', { body: {
    game_id: 'created-game', to_session_ids: ['friend-one', 'friend-two'], from_session_id: 'player', device_id: 'device',
  } });
});
it('does not send lobby invitations when device verification fails', async () => {
  mocks.claim.mockRejectedValue(new Error('offline'));
  expect((await sendLobbyInvites('created-game', ['friend-one'])).ok).toBe(false);
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('failed registration blocks both sending and replying', async () => {
  mocks.claim.mockRejectedValue(new Error('offline'));
  expect((await sendInvite({ toSessionId: 'friend', toName: 'Friend' })).ok).toBe(false);
  expect((await respondInvite({ inviteId: 'invite', action: 'decline' })).ok).toBe(false);
  expect(mocks.invoke).not.toHaveBeenCalled();
});it('crossed invite: sending to someone who already invited you returns the shared game', async () => {
  mocks.claim.mockResolvedValue('device');
  mocks.invoke.mockResolvedValue({ data: { success: true, invite_id: 'theirs', merged: true, game_id: 'g1' } });
  expect((await sendInvite({ toSessionId: 'friend', toName: 'Friend' })).mergedGameId).toBe('g1');
  mocks.invoke.mockResolvedValue({ data: { success: true, invite_id: 'mine' } });
  expect((await sendInvite({ toSessionId: 'friend', toName: 'Friend' })).mergedGameId).toBeUndefined();
});
