import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { onboardingCopy } from '@/lib/onboarding-copy';

type Seat = { name: string; badge?: string };

function flag(cc: string) {
  return String.fromCodePoint(...[...cc].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * Online quick match only: a 2 s card introducing the real opponent, and a
 * short pill when a computer seat takes over a player who left. Display only.
 */
export default function QuickMatchOpponentNotice({ gameId, players, myIndex }: {
  gameId: string | null; players: Seat[]; myIndex: number | null;
}) {
  const copy = onboardingCopy();
  const [intro, setIntro] = useState<{ name: string; flag: string } | null>(null);
  const [took, setTook] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);
  const prevRef = useRef<Seat[] | null>(null);

  // Intro card once per match, for the first real opponent.
  useEffect(() => {
    if (!gameId || myIndex === null || shownRef.current === gameId) return;
    const idx = players.findIndex((p, i) => i !== myIndex && p.badge === 'online');
    if (idx < 0) return;
    shownRef.current = gameId;
    let alive = true;
    let timer: number | undefined;
    void (async () => {
      let f = '';
      try {
        const { data } = await supabase.from('game_players').select('session_id')
          .eq('game_id', gameId).eq('player_index', idx).maybeSingle();
        if (data?.session_id) {
          const { data: r } = await supabase.rpc('get_country_rank', { p_session_id: data.session_id });
          const cc = r && typeof r === 'object' && !Array.isArray(r) ? (r as { country?: unknown }).country : null;
          if (typeof cc === 'string' && /^[A-Z]{2}$/.test(cc)) f = flag(cc);
        }
      } catch { /* flag is optional */ }
      if (!alive) return;
      setIntro({ name: players[idx].name, flag: f });
      timer = window.setTimeout(() => setIntro(null), 2000);
    })();
    return () => { alive = false; if (timer) window.clearTimeout(timer); };
  }, [gameId, myIndex, players]);

  // Pill when a real seat becomes a computer seat.
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = players;
    if (!prev) return;
    const i = players.findIndex((p, k) => p.badge === 'bot' && prev[k]?.badge === 'online');
    if (i < 0) return;
    setTook(copy.took.replace('{name}', players[i].name));
    const t = window.setTimeout(() => setTook(null), 4000);
    return () => window.clearTimeout(t);
  }, [players, copy.took]);

  return (
    <>
      <AnimatePresence>
        {intro && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
          >
            <div className="rounded-3xl border border-border bg-card px-8 py-6 text-center shadow-2xl">
              {intro.flag && <div className="text-5xl leading-none mb-3">{intro.flag}</div>}
              <div className="font-display text-2xl font-bold text-foreground">{intro.name}</div>
              <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-game-success" aria-hidden="true" />
                {copy.real}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {took && (
          <motion.div
            key="took"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="fixed inset-x-0 z-[60] flex justify-center pointer-events-none"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 150px)' }}
          >
            <div className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground shadow-lg">🖥️ {took}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
