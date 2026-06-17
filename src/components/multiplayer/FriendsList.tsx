import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Send, Loader2, Minimize } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { useTranslation } from '@/lib/i18n';
import { sendInvite, respondInvite } from '@/lib/invites';
import { getHiddenFriends } from '@/lib/friend-stats';
import {
  getFriendAliases,
  resolveFriendId,
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

export function FriendsList() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const myId = getSessionId();

  const [rows, setRows] = useState<FriendMatchRow[] | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<{ inviteId: string; opponentName: string } | null>(null);
  const [activeInvites, setActiveInvites] = useState<Record<string, { inviteId: string; gameId?: string }>>({});
  const [hiddenFriends] = useState<string[]>(() => getHiddenFriends());
  const [aliasVersion, setAliasVersion] = useState(0);

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

  const minimizeInvite = () => setPendingInvite(null);

  const reopenInvite = (opponentId: string, opponentName: string) => {
    const inv = activeInvites[opponentId];
    if (!inv) return;
    setPendingInvite({ inviteId: inv.inviteId, opponentName });
  };

  useEffect(() => {
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
        console.warn('[friends-list] load error', error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as FriendMatchRow[]);
      }
    };
    load();

    const chanP1 = supabase
      .channel(`friends-list-p1-${myId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_match_results', filter: `player_1_id=eq.${myId}` },
        () => load(),
      )
      .subscribe();
    const chanP2 = supabase
      .channel(`friends-list-p2-${myId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_match_results', filter: `player_2_id=eq.${myId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(chanP1);
      supabase.removeChannel(chanP2);
    };
  }, [myId]);

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
      .channel(`friends-list-invites-out-${myId}`)
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
              delete next[row.to_session_id];
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(invChan);
    };
  }, [myId]);

  const activeGameIds = useMemo(
    () => Object.values(activeInvites).map((v) => v.gameId).filter(Boolean).join(','),
    [activeInvites],
  );
  useEffect(() => {
    if (!activeGameIds) return;
    const ids = activeGameIds.split(',');
    const chan = supabase
      .channel(`friends-list-games-${myId}-${activeGameIds}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=in.(${ids.join(',')})` },
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
    return () => { supabase.removeChannel(chan); };
  }, [activeGameIds, myId]);

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
    return Array.from(map.values()).sort((a, b) => {
      if (!!a.ongoingMatch !== !!b.ongoingMatch) return a.ongoingMatch ? -1 : 1;
      const aT = (a.ongoingMatch ?? a.lastMatch).created_at;
      const bT = (b.ongoingMatch ?? b.lastMatch).created_at;
      return new Date(bT).getTime() - new Date(aT).getTime();
    });
  }, [rows, myId, hiddenFriends, aliasMap]);

  if (rows === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (opponents.length === 0) {
    return (
      <div className="text-center py-8 space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-secondary/60 border border-border/50">
          <Users className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm px-4">
          {t('friendStatsEmpty')}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2.5">
        {opponents.map((o) => {
          const hasFinished = o.matches > 0;
          const myScore = hasFinished
            ? (o.lastMatch.player_1_id === myId ? o.lastMatch.player_1_score : o.lastMatch.player_2_score) ?? 0
            : 0;
          const oppScore = hasFinished
            ? (o.lastMatch.player_1_id === myId ? o.lastMatch.player_2_score : o.lastMatch.player_1_score) ?? 0
            : 0;
          const lastWon = hasFinished && o.lastMatch.winner_id === myId;
          const lastDraw = hasFinished && o.lastMatch.winner_id === null;
          const alreadyInvited = !!activeInvites[o.opponentId];
          const isSending = inviting === o.opponentId;
          return (
            <motion.div
              key={o.opponentId}
              className={`w-full p-4 rounded-2xl border ${
                o.ongoingMatch
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-secondary/60 border-border/50'
              }`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <button
                onClick={() => navigate('/friend-stats', { state: { selectedId: o.opponentId } })}
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
                    <span className="px-2 py-0.5 rounded-md bg-game-success/15 text-game-success">{o.wins}</span>
                    <span className="px-2 py-0.5 rounded-md bg-destructive/15 text-destructive">{o.losses}</span>
                    {o.draws > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{o.draws}</span>
                    )}
                  </div>
                </div>
                {o.ongoingMatch ? (
                  <div className="mt-2.5 pt-2.5 border-t border-primary/30 flex items-center justify-between text-[10px] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-primary font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      {t('ongoingMatch')}
                    </span>
                    <span className="text-muted-foreground normal-case tracking-normal">
                      {formatDate(o.ongoingMatch.created_at)}
                    </span>
                  </div>
                ) : hasFinished ? (
                  <div className="mt-2.5 pt-2.5 border-t border-border/40 flex items-center justify-between text-[10px] uppercase tracking-wider">
                    <span className="text-muted-foreground">{t('friendsLastMatch')}</span>
                    <span className={`font-bold ${
                      lastDraw ? 'text-muted-foreground'
                        : lastWon ? 'text-game-success' : 'text-destructive'
                    }`}>
                      {myScore} – {oppScore} · {formatDate(o.lastMatch.created_at)}
                    </span>
                  </div>
                ) : null}
              </button>
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
            </motion.div>
          );
        })}
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
      </AnimatePresence>
    </>
  );
}
