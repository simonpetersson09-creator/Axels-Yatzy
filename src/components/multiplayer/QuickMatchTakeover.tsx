import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { playBotTurn } from '@/lib/dev-bot-turn';

/** Opponent must have been silent this long on their turn before the computer plays. */
export const TAKEOVER_AFTER_MS = 60_000;
const CHECK_MS = 5_000;

/**
 * Online quick matches only (games.is_quick_match): when the opponent has left
 * (no heartbeat for 60 s) and it is their turn, this client plays their turn
 * with the computer AI. If they come back, their heartbeat resumes and they
 * play again themselves. Friend matches are never affected.
 */
export function QuickMatchTakeover({ gameId }: { gameId: string | null }) {
  const busyRef = useRef(false);

  useEffect(() => {
    if (!gameId) return;
    let stopped = false;
    const me = getSessionId();

    const tick = async () => {
      if (stopped || busyRef.current) return;
      try {
        const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();
        if (!game || !game.is_quick_match || game.status !== 'playing') return;
        const { data: players } = await supabase
          .from('game_players')
          .select('player_index, scores, session_id, last_active_at')
          .eq('game_id', gameId);
        const current = players?.find((p) => p.player_index === game.current_player_index);
        if (!current || current.session_id === me) return;
        if (!players?.some((p) => p.session_id === me)) return;
        const idleMs = Date.now() - new Date(current.last_active_at).getTime();
        if (idleMs < TAKEOVER_AFTER_MS) return;

        busyRef.current = true;
        await playBotTurn(
          game as any,
          { player_index: current.player_index, scores: current.scores as Record<string, number | null> },
          current.session_id,
        );
      } catch (e) {
        console.warn('[takeover] failed', e);
      } finally {
        busyRef.current = false;
      }
    };

    const timer = window.setInterval(() => void tick(), CHECK_MS);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [gameId]);

  return null;
}
