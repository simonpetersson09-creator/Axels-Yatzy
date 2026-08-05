import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { aiDecideLocks, aiPickCategory } from '@/lib/yatzy-ai';

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

  useEffect(() => {
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
        let dice = game.dice;
        let rollsLeft = game.rolls_left;
        let locks = game.locked_dice;

        while (!stopped && rollsLeft > 0) {
          if (rollsLeft < 3) {
            const wantedLocks = aiDecideLocks(dice, player.scores, rollsLeft);
            for (let index = 0; index < 5; index += 1) {
              if (wantedLocks[index] !== locks[index]) {
                const { error } = await supabase.rpc('perform_toggle_lock', {
                  p_game_id: game.id,
                  p_session_id: ghostSession,
                  p_dice_index: index,
                });
                if (error) throw error;
              }
            }
            locks = wantedLocks;
          }

          const clientDice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
          const { data, error } = await supabase.rpc('perform_roll_dice', {
            p_game_id: game.id,
            p_session_id: ghostSession,
            p_client_dice: clientDice,
          });
          if (error) throw error;
          const result = data as { success?: boolean; error?: string; dice?: number[]; rolls_left?: number };
          if (!result.success) throw new Error(result.error ?? 'Botens kast nekades');
          dice = result.dice ?? dice;
          rollsLeft = result.rolls_left ?? rollsLeft - 1;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        if (stopped) return;
        const category = aiPickCategory(dice, player.scores);
        const { data, error } = await supabase.rpc('perform_submit_score', {
          p_game_id: game.id,
          p_session_id: ghostSession,
          p_category_id: category,
        });
        if (error) throw error;
        const result = data as { success?: boolean; error?: string };
        if (!result.success) throw new Error(result.error ?? 'Botens poängval nekades');
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
  }, []);

  return null;
}