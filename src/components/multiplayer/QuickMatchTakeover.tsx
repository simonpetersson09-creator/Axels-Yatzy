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
 * Online quick matches only (games.is_quick_match). Plays turns for:
 *  - computer seats (game_players.is_bot) immediately, and
 *  - human opponents who have been silent for 60 s on their turn (shows a
 *    "Computer is playing for X" badge and sends them a one-time push).
 * Exactly one client drives the computer: the present human with the lowest
 * seat index, so turns are never played twice. Friend matches are never affected.
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
          .select('player_index, player_name, scores, session_id, last_active_at, is_bot')
          .eq('game_id', gameId);
        const list = players ?? [];
        const mine = list.find((p) => p.session_id === me);
        const current = list.find((p) => p.player_index === game.current_player_index);
        if (!mine || !current || current.session_id === me) { setBotFor(null); return; }

        const isIdle = (p: typeof current) =>
          p.is_bot || Date.now() - new Date(p.last_active_at).getTime() >= TAKEOVER_AFTER_MS;
        if (!isIdle(current)) { setBotFor(null); return; }

        // Only the present human with the lowest seat drives the computer.
        const controller = list
          .filter((p) => !p.is_bot && (p.session_id === me || !isIdle(p)))
          .sort((a, b) => a.player_index - b.player_index)[0];
        if (controller?.session_id !== me) {
          setBotFor(current.is_bot ? null : current.player_name);
          return;
        }

        busyRef.current = true;
        if (!current.is_bot) {
          setBotFor(current.player_name);
          if (!notifiedRef.current) {
            notifiedRef.current = true;
            void supabase.functions.invoke('quick-match-bot', { body: { game_id: gameId } }).then(() => {}, () => {});
          }
        } else {
          setBotFor(null);
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
