import type { InviteRow } from './invites';

export interface OpenLobby { gameId: string; code: string; createdAt: string }

/** Only group invitations tied to a lobby that actually has a Home card. */
export function groupHomeInvites(invites: InviteRow[], lobbies: OpenLobby[]) {
  const lobbyIds = new Set(lobbies.map(lobby => lobby.gameId));
  const byLobby = new Map<string, InviteRow[]>();
  const standalone: InviteRow[] = [];
  for (const invite of invites) {
    if (invite.lobby_invite && invite.game_id && lobbyIds.has(invite.game_id)) {
      const group = byLobby.get(invite.game_id) ?? [];
      group.push(invite);
      byLobby.set(invite.game_id, group);
    } else standalone.push(invite);
  }
  return { byLobby, standalone };
}