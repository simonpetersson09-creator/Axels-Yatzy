import { expect, it } from 'vitest';
import type { InviteRow } from './invites';
import { groupHomeInvites } from './home-invite-groups';

const lobby = { gameId: 'game', code: 'ABC123', createdAt: '' };
const invite = (id: string, overrides: Partial<InviteRow> = {}): InviteRow => ({
  id, from_session_id: 'me', from_name: 'Simon', to_session_id: id, to_name: id,
  status: 'pending', game_id: 'game', lobby_invite: true, created_at: '', expires_at: '', responded_at: null,
  ...overrides,
});
it('groups two invited players under the same created game, without extra cards', () => {
  const result = groupHomeInvites([invite('Anna'), invite('Erik')], [lobby]);
  expect(result.standalone).toHaveLength(0);
  expect(result.byLobby.get('game')?.map(row => row.to_name)).toEqual(['Anna', 'Erik']);
});
it('keeps ordinary friend invitations separate even when a game id matches', () => {
  const result = groupHomeInvites([invite('friend', { lobby_invite: false })], [lobby]);
  expect(result.standalone.map(row => row.id)).toEqual(['friend']);
  expect(result.byLobby.size).toBe(0);
});
it('does not hide invitations while lobby discovery is pending or the game is no longer listed', () => {
  expect(groupHomeInvites([invite('Anna')], []).standalone).toHaveLength(1);
  expect(groupHomeInvites([invite('Erik', { game_id: null })], [lobby]).standalone).toHaveLength(1);
});