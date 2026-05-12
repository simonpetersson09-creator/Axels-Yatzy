import { supabase } from '@/integrations/supabase/client';

interface SaveFriendMatchInput {
  gameId: string;
  player1: { id: string; name: string; score: number };
  player2: { id: string; name: string; score: number };
  winnerId: string | null;
}

/**
 * Persist a head-to-head multiplayer match result. Fire-and-forget — never
 * throws into the caller. Only one of the two clients should call this
 * (typically the host / player_index === 0) to avoid duplicates.
 */
export function saveFriendMatchResult(input: SaveFriendMatchInput): void {
  try {
    // Normalize ordering so the same pair always lands in a predictable
    // (p1,p2) layout, which makes head-to-head queries simpler later.
    const [a, b] = [input.player1, input.player2].sort((x, y) =>
      x.id.localeCompare(y.id)
    );
    const winner_id = input.winnerId ?? null;

    void supabase
      .from('friend_match_results')
      .insert({
        game_id: input.gameId,
        player_1_id: a.id,
        player_1_name: a.name,
        player_1_score: a.score,
        player_2_id: b.id,
        player_2_name: b.name,
        player_2_score: b.score,
        winner_id,
        game_mode: 'multiplayer',
      })
      .then(({ error }) => {
        if (error) console.warn('[friend-stats] save failed', error.message);
      });
  } catch (err) {
    console.warn('[friend-stats] unexpected error', err);
  }
}
