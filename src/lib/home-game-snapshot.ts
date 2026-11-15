import { supabase } from '@/integrations/supabase/client';

/** A failed/partial read is unknown, never evidence that a saved seat is gone. */
export async function fetchHomeGameSnapshot(ids: string[]) {
  try {
    const [games, players] = await Promise.all([
      supabase.from('games').select('id, status, current_player_index, created_at, updated_at').in('id', ids),
      supabase.from('game_players').select('game_id, session_id, player_index, player_name, last_active_at').in('game_id', ids),
    ]);
    if (games.error || players.error || !games.data || !players.data) return null;
    return { games: games.data, players: players.data };
  } catch {
    return null;
  }
}

/** Serial foreground refreshes; failed reads preserve the previous snapshot. */
export function watchHomeGameSnapshot(
  ids: string[],
  onSnapshot: (snapshot: NonNullable<Awaited<ReturnType<typeof fetchHomeGameSnapshot>>>) => void,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    const snapshot = document.hidden ? null : await fetchHomeGameSnapshot(ids);
    if (stopped) return;
    if (snapshot) onSnapshot(snapshot);
    if (!stopped) timer = setTimeout(() => void refresh(), snapshot ? 15_000 : 5000);
  };
  void refresh();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}