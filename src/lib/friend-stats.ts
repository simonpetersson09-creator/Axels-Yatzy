interface SaveFriendMatchInput {
  gameId: string;
  player1: { id: string; name: string; score: number };
  player2: { id: string; name: string; score: number };
  winnerId: string | null;
}

/**
 * Friend match results are now recorded server-side from canonical game data
 * by the `submit-score` and `forfeit-game` edge functions (via the
 * `record_friend_match` RPC). Clients are no longer trusted to submit
 * scores or winners. This function is kept as a no-op to preserve existing
 * call sites.
 */
export function saveFriendMatchResult(_input: SaveFriendMatchInput): void {
  // intentionally no-op
}

const HIDDEN_FRIENDS_KEY = 'yatzy_hidden_friends';

export function getHiddenFriends(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_FRIENDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
  } catch { /* noop */ }
  return [];
}

export function hideFriend(sessionId: string): void {
  const list = getHiddenFriends();
  if (!list.includes(sessionId)) {
    list.push(sessionId);
    localStorage.setItem(HIDDEN_FRIENDS_KEY, JSON.stringify(list));
  }
}

export function unhideFriend(sessionId: string): void {
  const list = getHiddenFriends().filter((id) => id !== sessionId);
  localStorage.setItem(HIDDEN_FRIENDS_KEY, JSON.stringify(list));
}
