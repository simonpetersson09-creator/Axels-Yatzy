import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { playBotTurn } from '@/lib/dev-bot-turn';
import { useTranslation } from '@/lib/i18n';

/** Opponent must have been silent this long on their turn before the computer plays. */
export const TAKEOVER_AFTER_MS = 60_000;
const CHECK_MS = 5_000;

/**
 * Online quick matches only (games.is_quick_match): when the opponent has left
 * (no heartbeat for 60 s) and it is their turn, this client plays their turn
 * with the computer AI and shows a "Computer is playing for X" badge. The absent
 * player gets a one-time push. If they come back, their heartbeat resumes and
 * they play again themselves. Friend matches are never affected.
 */
export function QuickMatchTakeover({ gameId }: { gameId: string | null }) {
  const { t } = useTranslation();
  const busyRef = useRef(false);
  const notifiedRef = useRef(false);
  const [botFor, setBotFor] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    let stopped = false;
    const me = getSessionId();

    const tick = async () => {
      if (stopped || busyRef.current) return;
      try {
        const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();
        if (!game || !game.is_quick_match || game.status !== 'playing') { setBotFor(null); return; }
        const { data: players } = await supabase
          .from('game_players')
          .select('player_index, player_name, scores, session_id, last_active_at')
          .eq('game_id', gameId);
        const current = players?.find((p) => p.player_index === game.current_player_index);
        if (!current || current.session_id === me || !players?.some((p) => p.session_id === me)) {
          setBotFor(null);
          return;
        }
        const idleMs = Date.now() - new Date(current.last_active_at).getTime();
        if (idleMs < TAKEOVER_AFTER_MS) { setBotFor(null); return; }

        busyRef.current = true;
        setBotFor(current.player_name);
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          void supabase.functions.invoke('quick-match-bot', { body: { game_id: gameId } }).then(() => {}, () => {});
        }
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

  return (
    <AnimatePresence>
      {botFor && (
        <motion.div
          className="fixed left-1/2 z-40 -translate-x-1/2 pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          <div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-card/95 px-3 py-1 text-xs font-semibold text-foreground shadow-lg backdrop-blur-sm">
            <Bot className="h-3.5 w-3.5 text-primary" />
            {t('computerPlaysFor', { name: botFor })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
