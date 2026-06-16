import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Users, Trophy, X, Minus, Send, Loader2, Trash2, Minimize, Combine, Unlink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { useTranslation } from '@/lib/i18n';
import { sendInvite, respondInvite } from '@/lib/invites';
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
  lastMatch: FriendMatchRow;          // most recent finished match (for stats line)
  ongoingMatch: FriendMatchRow | null; // active match if any
  mergedSourceIds: string[];
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
  const [inviting, setInviting] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<{ inviteId: string; opponentName: string } | null>(null);
  // Map: opponent session_id -> { inviteId, gameId? } for invites I've sent that are still "active"
  // (pending OR accepted-but-match-not-finished). Reset when invite is declined/expired/cancelled
  // or when the resulting match finishes.
  const [activeInvites, setActiveInvites] = useState<Record<string, { inviteId: string; gameId?: string }>>({});
  const [hiddenFriends, setHiddenFriends] = useState<string[]>(() => getHiddenFriends());
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [aliasVersion, setAliasVersion] = useState(0);
  const [mergePickerOpen, setMergePickerOpen] = useState(false);

  useEffect(() => subscribeFriendAliases(() => setAliasVersion((v) => v + 1)), []);
  const aliasMap = useMemo(() => getFriendAliases(), [aliasVersion]);

  const handleInvite = async (opponentId: string, opponentName: string) => {
    if (inviting) return;
    setInviting(opponentId);
    const res = await sendInvite({ toSessionId: opponentId, toName: opponentName });
    setInviting(null);
    if (!res.ok) {
      toast.error(res.error ?? t('errSendInvite'));
      return;
    }
    setPendingInvite({ inviteId: res.inviteId!, opponentName });
    setActiveInvites((cur) => ({ ...cur, [opponentId]: { inviteId: res.inviteId! } }));
  };

  const cancelInvite = async () => {
    if (!pendingInvite) return;
    await respondInvite({ inviteId: pendingInvite.inviteId, action: 'decline' });
    setPendingInvite(null);
  };

  const minimizeInvite = () => {
    setPendingInvite(null);
  };

  const reopenInvite = (opponentId: string, opponentName: string) => {
    const inv = activeInvites[opponentId];
    if (!inv) return;
    setPendingInvite({ inviteId: inv.inviteId, opponentName });
  };

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

  // Load active invites I've sent + subscribe to realtime changes.
  // An invite stays "active" while pending; once accepted it stays "active" until the
  // resulting match finishes; declined/expired/cancelled clears it immediately.
  useEffect(() => {
    let cancelled = false;

    const loadActive = async () => {
      const { data: invites } = await supabase
        .from('game_invites')
        .select('id, to_session_id, status, game_id, expires_at')
        .eq('from_session_id', myId)
        .in('status', ['pending', 'accepted']);
      if (cancelled || !invites) return;

      const now = Date.now();
      const next: Record<string, { inviteId: string; gameId?: string }> = {};
      const acceptedGameIds: string[] = [];
      for (const inv of invites) {
        if (inv.status === 'pending') {
          if (inv.expires_at && new Date(inv.expires_at).getTime() < now) continue;
          next[inv.to_session_id] = { inviteId: inv.id };
        } else if (inv.status === 'accepted' && inv.game_id) {
          next[inv.to_session_id] = { inviteId: inv.id, gameId: inv.game_id };
          acceptedGameIds.push(inv.game_id);
        }
      }
      // Drop any whose game is already finished
      if (acceptedGameIds.length > 0) {
        const { data: games } = await supabase
          .from('games')
          .select('id, status')
          .in('id', acceptedGameIds);
        const finished = new Set((games ?? []).filter((g) => g.status === 'finished').map((g) => g.id));
        for (const k of Object.keys(next)) {
          const gid = next[k].gameId;
          if (gid && finished.has(gid)) delete next[k];
        }
      }
      if (!cancelled) setActiveInvites(next);
    };

    loadActive();

    const invChan = supabase
      .channel(`stats-invites-out-${myId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_invites', filter: `from_session_id=eq.${myId}` },
        (payload) => {
          const row = payload.new as { id: string; to_session_id: string; status: string; game_id: string | null };
          setActiveInvites((cur) => {
            const next = { ...cur };
            if (row.status === 'accepted') {
              next[row.to_session_id] = { inviteId: row.id, gameId: row.game_id ?? undefined };
            } else if (row.status === 'pending') {
              next[row.to_session_id] = { inviteId: row.id };
            } else {
              // declined / expired / cancelled
              delete next[row.to_session_id];
            }
            return next;
          });
        },
      )
      .subscribe();

    const gameChan = supabase
      .channel(`stats-games-${myId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games' },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.status !== 'finished') return;
          setActiveInvites((cur) => {
            let changed = false;
            const next: typeof cur = {};
            for (const [oppId, v] of Object.entries(cur)) {
              if (v.gameId === row.id) { changed = true; continue; }
              next[oppId] = v;
            }
            return changed ? next : cur;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(invChan);
      supabase.removeChannel(gameChan);
    };
  }, [myId]);

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
      const myScore = iAmP1 ? r.player_1_score : r.player_2_score;
      const won = r.winner_id === myId;
      const lost = r.winner_id !== null && r.winner_id !== myId;
      const draw = r.winner_id === null;

      const cur: OpponentSummary = map.get(oppId) ?? {
        opponentId: oppId,
        opponentName: oppName,
        matches: 0, wins: 0, losses: 0, draws: 0,
        myHigh: 0,
        lastMatch: r,
        mergedSourceIds: [],
      };
      cur.matches += 1;
      if (won) cur.wins += 1;
      if (lost) cur.losses += 1;
      if (draw) cur.draws += 1;
      if (myScore > cur.myHigh) cur.myHigh = myScore;
      if (cur.matches === 1) cur.opponentName = oppName;
      // Track which raw ids merged into this canonical card (excluding the canonical itself)
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
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMatch.created_at).getTime() - new Date(a.lastMatch.created_at).getTime()
    );
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
    setSelected(null);
    setConfirmRemove(null);
    toast.success(t('friendRemoved'));
  };

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
                <motion.div
                  key={o.opponentId}
                  className="w-full p-4 rounded-2xl bg-secondary/60 border border-border/50"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <button
                    onClick={() => setSelected(o.opponentId)}
                    className="w-full text-left active:opacity-80 transition"
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
                  </button>
                  {(() => {
                    const alreadyInvited = !!activeInvites[o.opponentId];
                    const isSending = inviting === o.opponentId;
                    return (
                      <motion.button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (alreadyInvited) {
                            reopenInvite(o.opponentId, o.opponentName);
                          } else {
                            handleInvite(o.opponentId, o.opponentName);
                          }
                        }}
                        disabled={isSending || !!pendingInvite}
                        whileTap={{ scale: 0.97 }}
                        className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/15 text-primary border border-primary/30 active:bg-primary/25 transition font-display font-bold text-sm disabled:opacity-60"
                      >
                        {isSending ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {t('sendingInvite')}
                          </>
                        ) : alreadyInvited ? (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            {t('inviteSent')}
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            {t('inviteToGame')}
                          </>
                        )}
                      </motion.button>
                    );
                  })()}
                </motion.div>
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

            {detailSummary.mergedSourceIds.length > 0 && (
              <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-primary font-bold">
                  Hopslagna kort ({detailSummary.mergedSourceIds.length})
                </div>
                <div className="space-y-1.5">
                  {detailSummary.mergedSourceIds.map((srcId) => (
                    <div key={srcId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground font-mono truncate">
                        …{srcId.slice(-8)}
                      </span>
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

      <AnimatePresence>
        {pendingInvite && (
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
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 border border-primary/30">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-display font-black text-foreground">
                  {t('inviteWaitingTitle', { name: pendingInvite.opponentName })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('inviteWaitingDesc')}
                </p>
              </div>
              <div className="w-full flex gap-2.5">
                <button
                  onClick={minimizeInvite}
                  className="flex-1 py-3.5 rounded-2xl bg-primary text-primary-foreground font-display font-bold active:scale-95 transition inline-flex items-center justify-center gap-2"
                >
                  <Minimize className="w-4 h-4" />
                  {t('minimize')}
                </button>
                <button
                  onClick={cancelInvite}
                  className="flex-1 py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-display font-bold active:scale-95 transition"
                >
                  {t('cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

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
