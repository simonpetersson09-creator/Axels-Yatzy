import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, Trophy, X, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { useTranslation } from '@/lib/i18n';

interface FriendMatchRow {
  id: string;
  game_id: string | null;
  player_1_id: string;
  player_1_name: string;
  player_1_score: number;
  player_2_id: string;
  player_2_name: string;
  player_2_score: number;
  winner_id: string | null;
  created_at: string;
}

interface OpponentSummary {
  opponentId: string;
  opponentName: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  myHigh: number;
  lastMatch: FriendMatchRow;
}

function formatDate(iso: string, locale = 'sv-SE') {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      day: 'numeric', month: 'short',
    });
  } catch { return ''; }
}

export default function FriendStatsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const myId = getSessionId();

  const [rows, setRows] = useState<FriendMatchRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('friend_match_results')
        .select('*')
        .or(`player_1_id.eq.${myId},player_2_id.eq.${myId}`)
        .order('created_at', { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        console.warn('[friend-stats] load error', error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as FriendMatchRow[]);
      }
    })();
    return () => { cancelled = true; };
  }, [myId]);

  const opponents = useMemo<OpponentSummary[]>(() => {
    if (!rows) return [];
    const map = new Map<string, OpponentSummary>();
    for (const r of rows) {
      const iAmP1 = r.player_1_id === myId;
      const oppId = iAmP1 ? r.player_2_id : r.player_1_id;
      const oppName = iAmP1 ? r.player_2_name : r.player_1_name;
      const myScore = iAmP1 ? r.player_1_score : r.player_2_score;
      const won = r.winner_id === myId;
      const lost = r.winner_id !== null && r.winner_id !== myId;
      const draw = r.winner_id === null;

      const cur = map.get(oppId) ?? {
        opponentId: oppId,
        opponentName: oppName,
        matches: 0, wins: 0, losses: 0, draws: 0,
        myHigh: 0,
        lastMatch: r,
      };
      cur.matches += 1;
      if (won) cur.wins += 1;
      if (lost) cur.losses += 1;
      if (draw) cur.draws += 1;
      if (myScore > cur.myHigh) cur.myHigh = myScore;
      // Use most recent name (rows already ordered desc)
      if (cur.matches === 1) cur.opponentName = oppName;
      map.set(oppId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.matches - a.matches);
  }, [rows, myId]);

  const detailMatches = useMemo(() => {
    if (!selected || !rows) return [];
    return rows.filter(r => r.player_1_id === selected || r.player_2_id === selected);
  }, [selected, rows]);

  const detailSummary = opponents.find(o => o.opponentId === selected) ?? null;

  return (
    <div className="app-screen flex flex-col px-5 safe-top safe-bottom overflow-y-auto overscroll-contain">
      <div className="w-full max-w-md mx-auto py-6 space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (selected ? setSelected(null) : navigate('/'))}
            className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center active:scale-95 transition"
            aria-label={t('friendStatsBack')}
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-xl font-display font-black text-foreground">
            {selected && detailSummary ? detailSummary.opponentName : t('friendStatsTitle')}
          </h1>
        </div>

        {rows === null && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {rows !== null && opponents.length === 0 && (
          <motion.div
            className="text-center py-16 space-y-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary/60 border border-border/50">
              <Users className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm px-6">
              {t('friendStatsEmpty')}
            </p>
          </motion.div>
        )}

        {/* Opponent list */}
        {rows !== null && !selected && opponents.length > 0 && (
          <div className="space-y-2.5">
            {opponents.map((o) => {
              const myScore = o.lastMatch.player_1_id === myId
                ? o.lastMatch.player_1_score : o.lastMatch.player_2_score;
              const oppScore = o.lastMatch.player_1_id === myId
                ? o.lastMatch.player_2_score : o.lastMatch.player_1_score;
              const lastWon = o.lastMatch.winner_id === myId;
              const lastDraw = o.lastMatch.winner_id === null;
              return (
                <motion.button
                  key={o.opponentId}
                  onClick={() => setSelected(o.opponentId)}
                  className="w-full text-left p-4 rounded-2xl bg-secondary/60 border border-border/50 active:bg-secondary transition"
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-bold text-foreground truncate">
                        {o.opponentName}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {o.matches} {t('friendsMatches')} · {t('friendsHighScore')}: {o.myHigh}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold tabular-nums">
                      <span className="px-2 py-0.5 rounded-md bg-game-success/15 text-game-success">
                        {o.wins}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-destructive/15 text-destructive">
                        {o.losses}
                      </span>
                      {o.draws > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                          {o.draws}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-border/40 flex items-center justify-between text-[10px] uppercase tracking-wider">
                    <span className="text-muted-foreground">{t('friendsLastMatch')}</span>
                    <span className={`font-bold ${
                      lastDraw ? 'text-muted-foreground'
                        : lastWon ? 'text-game-success' : 'text-destructive'
                    }`}>
                      {myScore} – {oppScore} · {formatDate(o.lastMatch.created_at)}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Detail head-to-head */}
        {selected && detailSummary && (
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="grid grid-cols-3 gap-2.5">
              <Stat icon={Trophy} label={t('friendsWins')} value={detailSummary.wins} tone="success" />
              <Stat icon={X} label={t('friendsLosses')} value={detailSummary.losses} tone="danger" />
              <Stat icon={Minus} label={t('friendsDraws')} value={detailSummary.draws} tone="muted" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-2xl bg-secondary/60 border border-border/50 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('friendsMatches')}
                </div>
                <div className="text-2xl font-display font-black text-foreground tabular-nums mt-1">
                  {detailSummary.matches}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-secondary/60 border border-border/50 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('friendsHighScore')}
                </div>
                <div className="text-2xl font-display font-black text-game-gold tabular-nums mt-1">
                  {detailSummary.myHigh}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                {t('friendsRecentMatches')}
              </h2>
              <div className="space-y-1.5">
                {detailMatches.map((r) => {
                  const myScore = r.player_1_id === myId ? r.player_1_score : r.player_2_score;
                  const oppScore = r.player_1_id === myId ? r.player_2_score : r.player_1_score;
                  const won = r.winner_id === myId;
                  const draw = r.winner_id === null;
                  const tag = draw ? t('friendsDraw') : won ? t('friendsYouWon') : t('friendsYouLost');
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 border border-border/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          draw ? 'bg-muted text-muted-foreground'
                            : won ? 'bg-game-success/20 text-game-success'
                            : 'bg-destructive/20 text-destructive'
                        }`}>
                          {tag}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(r.created_at)}
                        </span>
                      </div>
                      <span className="font-display font-bold tabular-nums text-foreground">
                        {myScore} – {oppScore}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, tone,
}: {
  icon: typeof Trophy;
  label: string;
  value: number;
  tone: 'success' | 'danger' | 'muted';
}) {
  const color =
    tone === 'success' ? 'text-game-success'
    : tone === 'danger' ? 'text-destructive'
    : 'text-muted-foreground';
  return (
    <div className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-secondary/60 border border-border/50">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className={`text-2xl font-display font-black tabular-nums leading-none ${color}`}>
        {value}
      </span>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
