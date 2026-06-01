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
