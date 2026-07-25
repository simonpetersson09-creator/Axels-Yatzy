import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Swords } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { getFriendAliases, resolveFriendId } from '@/lib/friend-aliases';
import { useTranslation } from '@/lib/i18n';

interface Row {
  player_1_id: string;
  player_1_score: number | null;
  player_2_id: string;
  player_2_score: number | null;
  winner_id: string | null;
  status: string;
}

interface Summary {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  myBest: number;
  myAvg: number;
  oppAvg: number;
}

/**
 * Head-to-head summary against a single opponent, covering every finished
 * match the two players have played (not just the current one).
 */
export function HeadToHeadStats({ opponentId, opponentName }: { opponentId: string; opponentName: string }) {
  const { t } = useTranslation();
  const myId = getSessionId();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('friend_match_results')
        .select('player_1_id,player_1_score,player_2_id,player_2_score,winner_id,status')
        .or(`player_1_id.eq.${myId},player_2_id.eq.${myId}`)
        .order('created_at', { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        console.warn('[h2h] load error', error.message);
        return;
      }
      const aliasMap = getFriendAliases();
      const target = resolveFriendId(opponentId, aliasMap);
      const rows = ((data ?? []) as Row[]).filter((r) => {
        if (r.status !== 'finished') return false;
        const iAmP1 = r.player_1_id === myId;
        const rawOpp = iAmP1 ? r.player_2_id : r.player_1_id;
        return resolveFriendId(rawOpp, aliasMap) === target;
      });

      let wins = 0, losses = 0, draws = 0, myBest = 0, mySum = 0, oppSum = 0;
      for (const r of rows) {
        const iAmP1 = r.player_1_id === myId;
        const my = (iAmP1 ? r.player_1_score : r.player_2_score) ?? 0;
        const opp = (iAmP1 ? r.player_2_score : r.player_1_score) ?? 0;
        mySum += my;
        oppSum += opp;
        if (my > myBest) myBest = my;
        if (r.winner_id === myId) wins += 1;
        else if (r.winner_id === null) draws += 1;
        else losses += 1;
      }
      const matches = rows.length;
      setSummary({
        matches,
        wins,
        losses,
        draws,
        myBest,
        myAvg: matches ? Math.round(mySum / matches) : 0,
        oppAvg: matches ? Math.round(oppSum / matches) : 0,
      });
    })();
    return () => { cancelled = true; };
  }, [myId, opponentId]);

  if (!summary || summary.matches === 0) return null;

  const cells: { label: string; value: string }[] = [
    { label: t('h2hMatches'), value: String(summary.matches) },
    { label: t('h2hWins'), value: String(summary.wins) },
    { label: t('h2hLosses'), value: String(summary.losses) },
    { label: t('h2hDraws'), value: String(summary.draws) },
    { label: t('h2hYourBest'), value: String(summary.myBest) },
    { label: t('h2hAverage'), value: `${summary.myAvg}–${summary.oppAvg}` },
  ];

  return (
    <motion.div
      className="glass-card p-4 space-y-3 text-left"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
    >
      <div className="flex items-center gap-2">
        <Swords className="w-4 h-4 text-game-gold flex-shrink-0" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {t('h2hTitle', { name: opponentName })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-xl bg-secondary/40 px-2 py-2 text-center">
            <p className="font-display font-bold text-lg tabular-nums text-foreground leading-none">{c.value}</p>
            <p className="mt-1 text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">{c.label}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
