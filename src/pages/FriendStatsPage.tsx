import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trophy, X, Minus, Trash2, Combine, Unlink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { useTranslation } from '@/lib/i18n';
import { getHiddenFriends, hideFriend } from '@/lib/friend-stats';
import {
  getFriendAliases,
  resolveFriendId,
  mergeFriend,
  unmergeFriend,
  subscribeFriendAliases,
} from '@/lib/friend-aliases';
import { toast } from 'sonner';

interface FriendMatchRow {
  id: string;
  game_id: string | null;
  player_1_id: string;
  player_1_name: string;
  player_1_score: number | null;
  player_2_id: string;
  player_2_name: string;
  player_2_score: number | null;
  winner_id: string | null;
  created_at: string;
  status: 'ongoing' | 'finished';
  finished_at: string | null;
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
  ongoingMatch: FriendMatchRow | null;
  mergedSourceIds: string[];
}

function formatDate(iso: string, locale = 'sv-SE') {
  try {
    return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

export default function FriendStatsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const myId = getSessionId();

  const selected = (location.state as { selectedId?: string } | null)?.selectedId ?? null;

  const [rows, setRows] = useState<FriendMatchRow[] | null>(null);
  const [hiddenFriends, setHiddenFriends] = useState<string[]>(() => getHiddenFriends());
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [aliasVersion, setAliasVersion] = useState(0);
  const [mergePickerOpen, setMergePickerOpen] = useState(false);

  useEffect(() => subscribeFriendAliases(() => setAliasVersion((v) => v + 1)), []);
  const aliasMap = useMemo(() => getFriendAliases(), [aliasVersion]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const load = async () => {
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
    };
    load();
    const chanP1 = supabase
      .channel(`friend-detail-p1-${myId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'friend_match_results', filter: `player_1_id=eq.${myId}` },
        () => load(),
      ).subscribe();
    const chanP2 = supabase
      .channel(`friend-detail-p2-${myId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'friend_match_results', filter: `player_2_id=eq.${myId}` },
        () => load(),
      ).subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(chanP1);
      supabase.removeChannel(chanP2);
    };
  }, [myId, selected]);

  const opponents = useMemo<OpponentSummary[]>(() => {
    if (!rows) return [];
    const hidden = new Set(hiddenFriends);
    const map = new Map<string, OpponentSummary>();
    const sourceTracker = new Map<string, Set<string>>();
    for (const r of rows) {
      const iAmP1 = r.player_1_id === myId;
      const rawOppId = iAmP1 ? r.player_2_id : r.player_1_id;
      const oppId = resolveFriendId(rawOppId, aliasMap);
      if (hidden.has(oppId)) continue;
      const oppName = iAmP1 ? r.player_2_name : r.player_1_name;
      const isOngoing = r.status === 'ongoing';
      const myScore = (iAmP1 ? r.player_1_score : r.player_2_score) ?? 0;
      const won = !isOngoing && r.winner_id === myId;
      const lost = !isOngoing && r.winner_id !== null && r.winner_id !== myId;
      const draw = !isOngoing && r.winner_id === null;

      const cur: OpponentSummary = map.get(oppId) ?? {
        opponentId: oppId,
        opponentName: oppName,
        matches: 0, wins: 0, losses: 0, draws: 0,
        myHigh: 0,
        lastMatch: r,
        ongoingMatch: null,
        mergedSourceIds: [],
      };

      if (isOngoing) {
        if (!cur.ongoingMatch) cur.ongoingMatch = r;
      } else {
        cur.matches += 1;
        if (won) cur.wins += 1;
        if (lost) cur.losses += 1;
        if (draw) cur.draws += 1;
        if (myScore > cur.myHigh) cur.myHigh = myScore;
        if (cur.matches === 1) {
          cur.lastMatch = r;
          cur.opponentName = oppName;
        }
      }

      if (rawOppId !== oppId) {
        let set = sourceTracker.get(oppId);
        if (!set) { set = new Set(); sourceTracker.set(oppId, set); }
        set.add(rawOppId);
      }
      map.set(oppId, cur);
    }
    for (const [id, set] of sourceTracker) {
      const entry = map.get(id);
      if (entry) entry.mergedSourceIds = Array.from(set);
    }
    return Array.from(map.values());
  }, [rows, myId, hiddenFriends, aliasMap]);

  const detailMatches = useMemo(() => {
    if (!selected || !rows) return [];
    return rows.filter((r) => {
      const oppRaw = r.player_1_id === myId ? r.player_2_id : r.player_1_id;
      return resolveFriendId(oppRaw, aliasMap) === selected;
    });
  }, [selected, rows, myId, aliasMap]);

  const detailSummary = opponents.find(o => o.opponentId === selected) ?? null;

  const handleRemove = (opponentId: string) => {
    hideFriend(opponentId);
    setHiddenFriends(getHiddenFriends());
    setConfirmRemove(null);
    toast.success(t('friendRemoved'));
    navigate('/multiplayer');
  };

  // No friend selected → list now lives in the multiplayer lobby.
  if (!selected) {
    return <Navigate to="/multiplayer" replace />;
  }

  return (
    <div className="app-screen flex flex-col px-5 safe-top safe-bottom overflow-y-auto overscroll-contain">
      <div className="w-full max-w-md mx-auto py-6 space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/multiplayer')}
            className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center active:scale-95 transition"
            aria-label={t('friendStatsBack')}
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-xl font-display font-black text-foreground">
            {detailSummary ? detailSummary.opponentName : t('friendStatsTitle')}
          </h1>
        </div>

        {rows === null && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {rows !== null && detailSummary && (
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

            {detailSummary.mergedSourceIds.length > 0 && (
              <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-primary font-bold">
                  Hopslagna kort ({detailSummary.mergedSourceIds.length})
                </div>
                <div className="space-y-1.5">
                  {detailSummary.mergedSourceIds.map((srcId) => (
                    <div key={srcId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground font-mono truncate">…{srcId.slice(-8)}</span>
                      <button
                        onClick={() => { unmergeFriend(srcId); toast.success('Hopslagning ångrad'); }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/80 text-foreground active:scale-95 transition"
                      >
                        <Unlink className="w-3 h-3" />
                        Ångra
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setMergePickerOpen(true)}
              className="w-full py-3 rounded-2xl bg-primary/10 text-primary border border-primary/25 font-display font-bold text-sm active:bg-primary/20 transition inline-flex items-center justify-center gap-2"
            >
              <Combine className="w-4 h-4" />
              Slå ihop med dubblettkort
            </button>

            <button
              onClick={() => setConfirmRemove(selected)}
              className="w-full py-3 rounded-2xl bg-destructive/10 text-destructive border border-destructive/25 font-display font-bold text-sm active:bg-destructive/20 transition inline-flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {t('removeFriend')}
            </button>

            <div className="space-y-1.5">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                {t('friendsRecentMatches')}
              </h2>
              <div className="space-y-1.5">
                {detailMatches.map((r) => {
                  const isOngoing = r.status === 'ongoing';
                  const myScore = (r.player_1_id === myId ? r.player_1_score : r.player_2_score) ?? 0;
                  const oppScore = (r.player_1_id === myId ? r.player_2_score : r.player_1_score) ?? 0;
                  const won = !isOngoing && r.winner_id === myId;
                  const draw = !isOngoing && r.winner_id === null;
                  const tag = isOngoing
                    ? 'Pågående'
                    : draw ? t('friendsDraw') : won ? t('friendsYouWon') : t('friendsYouLost');
                  return (
                    <div
                      key={r.id}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        isOngoing
                          ? 'bg-primary/10 border-primary/30'
                          : 'bg-secondary/40 border-border/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                          isOngoing ? 'bg-primary/20 text-primary'
                            : draw ? 'bg-muted text-muted-foreground'
                            : won ? 'bg-game-success/20 text-game-success'
                            : 'bg-destructive/20 text-destructive'
                        }`}>
                          {isOngoing && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                          {tag}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(r.created_at)}
                        </span>
                      </div>
                      <span className="font-display font-bold tabular-nums text-foreground">
                        {isOngoing ? '— – —' : `${myScore} – ${oppScore}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {rows !== null && !detailSummary && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {t('friendStatsEmpty')}
          </div>
        )}
      </div>

      <AnimatePresence>
        {mergePickerOpen && detailSummary && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMergePickerOpen(false)}
          >
            <motion.div
              className="w-full max-w-sm rounded-3xl bg-card border border-border/60 p-6 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto"
              initial={{ y: 30, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center space-y-1">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 border border-primary/30">
                  <Combine className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-lg font-display font-black text-foreground">
                  Slå ihop med {detailSummary.opponentName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Välj ett dubblettkort som ska slås ihop in i det här. All historik räknas sedan som samma vän.
                </p>
              </div>
              <div className="space-y-2">
                {opponents.filter((o) => o.opponentId !== selected).length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Inga andra vänner att slå ihop.
                  </p>
                )}
                {opponents
                  .filter((o) => o.opponentId !== selected)
                  .map((o) => (
                    <button
                      key={o.opponentId}
                      onClick={() => {
                        mergeFriend(o.opponentId, selected!);
                        setMergePickerOpen(false);
                        toast.success(`${o.opponentName} hopslagen med ${detailSummary.opponentName}`);
                      }}
                      className="w-full p-3 rounded-xl bg-secondary/60 border border-border/40 flex items-center justify-between active:scale-[0.98] transition"
                    >
                      <div className="text-left min-w-0">
                        <div className="font-display font-bold text-foreground truncate">{o.opponentName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {o.matches} matcher · senast {formatDate(o.lastMatch.created_at)}
                        </div>
                      </div>
                      <Combine className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setMergePickerOpen(false)}
                className="w-full py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-display font-bold active:scale-95 transition"
              >
                {t('cancel')}
              </button>
            </motion.div>
          </motion.div>
        )}

        {confirmRemove && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-sm rounded-3xl bg-card border border-border/60 p-6 shadow-2xl text-center space-y-4"
              initial={{ y: 30, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.95 }}
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/15 border border-destructive/30">
                <Trash2 className="w-6 h-6 text-destructive" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-display font-black text-foreground">
                  {t('removeFriend')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('removeFriendConfirm', { name: detailSummary?.opponentName ?? '' })}
                </p>
              </div>
              <div className="space-y-2.5">
                <button
                  onClick={() => handleRemove(confirmRemove)}
                  className="w-full py-3.5 rounded-2xl bg-destructive text-destructive-foreground font-display font-bold active:scale-95 transition"
                >
                  {t('removeFriend')}
                </button>
                <button
                  onClick={() => setConfirmRemove(null)}
                  className="w-full py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-display font-bold active:scale-95 transition"
                >
                  {t('cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
