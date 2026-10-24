import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from '@/lib/back-handler';
import { motion } from 'framer-motion';
import { Dices, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, requireClaimedDevice } from '@/lib/session';
import { useTranslation } from '@/lib/i18n';
import { useGameBanner } from '@/hooks/useGameBanner';
import { Button } from '@/components/ui/button';

const SEARCH_MS = 15_000;
const POLL_MS = 2_000;
/** How long the "Opponent found" card shows before the match opens. */
const FOUND_MS = 2_000;

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
  const [found, setFound] = useState<string | null>(null);
  // Android back = Avbryt (otherwise the app minimizes while still searching).
  useBackHandler(true, onCancel);

  useGameBanner(true, 'search');
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

    // Show who you are playing for a moment, so it is clear it's a real person.
    const announce = async (id: string) => {
      try {
        const { data } = await supabase
          .from('game_players')
          .select('player_name, session_id, is_bot')
          .eq('game_id', id);
        const names = (data ?? [])
          .filter((p) => !p.is_bot && p.session_id !== sessionId)
          .map((p) => p.player_name);
        if (names.length > 0) {
          setFound(names.join(', '));
          await new Promise((r) => window.setTimeout(r, FOUND_MS));
        }
      } catch { /* open the match anyway */ }
      cbRef.current.onMatched(id);
    };

    const poll = async () => {
      if (doneRef.current) return;
      try {
        await requireClaimedDevice();
        if (doneRef.current) return;
        const { data, error } = await supabase.rpc('find_or_join_match', {
          p_session_id: sessionId,
          p_player_name: playerName,
          p_players: players,
        });
        if (error) throw error;
        const res = data as { status?: string; game_id?: string; searching?: number } | null;
        if (res?.status === 'matched' && res.game_id) {
          const id = res.game_id;
          return finish(() => void announce(id));
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
        return finish(() => (matchedId ? void announce(matchedId) : cbRef.current.onNoMatch()));
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

  return createPortal(
    <motion.div
      className="quick-search-screen fixed inset-0 z-50 bg-background/95 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="quick-search-layout">
      <div className="quick-search-status w-full max-w-sm text-center">
        {found ? (
          <motion.div
            className="space-y-3"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-display font-bold text-foreground">{t('matchFoundTitle')}</h2>
            <p className="text-lg font-semibold text-primary">{t('matchFoundVs', { name: found })}</p>
          </motion.div>
        ) : (
        <>
        <motion.div
          className="quick-search-icon mx-auto rounded-xl bg-primary/15 flex items-center justify-center"
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
        <Button
          onClick={onCancel}
          variant="secondary"
          className="w-full h-11 font-semibold"
        >
          {t('cancelSearch')}
        </Button>
        </>
        )}
      </div>
      <div className="quick-search-ad-area">
        <div data-search-ad-slot className="quick-search-ad-slot" aria-hidden="true" />
      </div>
      </div>
    </motion.div>, document.body
  );
}
