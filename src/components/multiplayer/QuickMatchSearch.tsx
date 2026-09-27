import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Dices } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, claimSession } from '@/lib/session';
import { useTranslation } from '@/lib/i18n';

const SEARCH_MS = 20_000;
const POLL_MS = 2_000;

interface Props {
  playerName: string;
  /** Total seats in the match (2–4). Empty seats are filled by the computer. */
  players?: number;
  onMatched: (gameId: string) => void;
  onNoMatch: () => void;
  onCancel: () => void;
}

/**
 * Online quick match search. After 10 s whoever is waiting starts together and
 * the computer fills the empty seats; alone → local computer match. Offline →
 * local computer match immediately.
 */
export function QuickMatchSearch({ playerName, players = 2, onMatched, onNoMatch, onCancel }: Props) {
  const { t } = useTranslation();
  const doneRef = useRef(false);
  const cbRef = useRef({ onMatched, onNoMatch });
  cbRef.current = { onMatched, onNoMatch };
  const [searching, setSearching] = useState(1);

  useEffect(() => {
    const sessionId = getSessionId();
    let timer: number | undefined;
    const started = Date.now();

    const finish = (fn: () => void) => {
      if (doneRef.current) return;
      doneRef.current = true;
      window.clearTimeout(timer);
      fn();
    };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      finish(() => cbRef.current.onNoMatch());
      return;
    }

    const poll = async () => {
      if (doneRef.current) return;
      try {
        await claimSession();
        const { data, error } = await supabase.rpc('find_or_join_match', {
          p_session_id: sessionId,
          p_player_name: playerName,
          p_players: players,
        });
        if (error) throw error;
        const res = data as { status?: string; game_id?: string; searching?: number } | null;
        if (res?.status === 'matched' && res.game_id) {
          const id = res.game_id;
          return finish(() => cbRef.current.onMatched(id));
        }
        if (res?.status === 'error') throw new Error('matchmaking');
        if (typeof res?.searching === 'number') setSearching(res.searching);
      } catch {
        // No connection / server trouble → play against the computer right away.
        return finish(() => cbRef.current.onNoMatch());
      }
      if (doneRef.current) return;
      if (Date.now() - started >= SEARCH_MS) {
        let matchedId: string | null = null;
        try {
          const { data } = await supabase.rpc('finalize_matchmaking', { p_session_id: sessionId });
          const r = data as { status?: string; game_id?: string } | null;
          if (r?.status === 'matched' && r.game_id) matchedId = r.game_id;
        } catch { /* ignore */ }
        return finish(() => (matchedId ? cbRef.current.onMatched(matchedId) : cbRef.current.onNoMatch()));
      }
      timer = window.setTimeout(poll, POLL_MS);
    };
    void poll();

    return () => {
      window.clearTimeout(timer);
      if (!doneRef.current) {
        doneRef.current = true;
        void supabase.rpc('leave_matchmaking', { p_session_id: sessionId }).then(() => {}, () => {});
      }
    };
  }, [playerName, players]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card p-8 w-full max-w-sm text-center space-y-5">
        <motion.div
          className="mx-auto w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
        >
          <Dices className="w-8 h-8 text-primary" />
        </motion.div>
        <h2 className="text-xl font-display font-bold text-foreground">{t('searchingOpponent')}</h2>
        <p className="text-sm text-muted-foreground">{t('searchingOpponentHint')}</p>
        {players > 2 && (
          <p className="text-sm font-semibold text-primary">{searching} / {players}</p>
        )}
        <motion.div className="h-1 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: SEARCH_MS / 1000, ease: 'linear' }}
          />
        </motion.div>
        <button
          onClick={onCancel}
          className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold"
        >
          {t('cancelSearch')}
        </button>
      </div>
    </motion.div>
  );
}
