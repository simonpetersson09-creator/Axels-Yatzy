import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { playBotTurn } from '@/lib/dev-bot-turn';

const GHOST_KEY = 'dev_ghost_session_id';

interface GameRow {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  current_player_index: number;
  dice: number[];
  locked_dice: boolean[];
  rolls_left: number;
}

interface PlayerRow {
  player_index: number;
  scores: Record<string, number | null>;
}

/** Keeps the development Testkompis running even after navigating into the match. */
export default function DevFriendBotRunner() {
  const busyRef = useRef(false);
  const { pathname } = useLocation();

  useEffect(() => {
    // DevFriendPage owns the bot while its controls are visible; this runner
    // takes over only after the tester navigates into the real match view.
    if (pathname === '/dev-friend') return;
    let stopped = false;

    const tick = async () => {
      if (stopped || busyRef.current) return;
      const ghostSession = localStorage.getItem(GHOST_KEY);
      if (!ghostSession) return;

      const { data: memberships } = await supabase
        .from('game_players')
        .select('game_id, joined_at')
        .eq('session_id', ghostSession)
        .order('joined_at', { ascending: false })
        .limit(1);
      const gameId = memberships?.[0]?.game_id;
      if (!gameId) return;

      const [{ data: gameData }, { data: playerData }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).maybeSingle(),
        supabase
          .from('game_players')
          .select('player_index, scores')
          .eq('game_id', gameId)
          .eq('session_id', ghostSession)
          .maybeSingle(),
      ]);
      const game = gameData as GameRow | null;
      const player = playerData as PlayerRow | null;
      if (!game || !player || game.status !== 'playing') return;
      if (game.current_player_index !== player.player_index) return;

      busyRef.current = true;
      try {
        await playBotTurn(game, player, ghostSession);
      } catch (error) {
        console.error('Dev Testkompis kunde inte spela sin tur:', error);
      } finally {
        busyRef.current = false;
      }

    };

    void tick();
    const timer = window.setInterval(() => void tick(), 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pathname]);

  return null;
}