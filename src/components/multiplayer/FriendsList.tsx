import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Loader2, Minimize } from 'lucide-react';
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
import { getKnownFriends, addKnownFriends, subscribeKnownFriends } from '@/lib/known-friends';
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
  lastMatch: FriendMatchRow | null;
  ongoingMatch: FriendMatchRow | null;
  mergedSourceIds: string[];
  sortAt: string;
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
  const [knownVersion, setKnownVersion] = useState(0);

  useEffect(() => subscribeFriendAliases(() => setAliasVersion((v) => v + 1)), []);
  useEffect(() => subscribeKnownFriends(() => setKnownVersion((v) => v + 1)), []);
  const aliasMap = useMemo(() => getFriendAliases(), [aliasVersion]);
  const knownFriends = useMemo(() => getKnownFriends(), [knownVersion]);

  // Save every player we've shared a game with — both sides do this, so a
  // friend is stored no matter who sent the invite.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const { data: mine } = await supabase
        .from('game_players')
        .select('game_id')
        .eq('session_id', myId)
        .order('joined_at', { ascending: false })
        .limit(100);
      const gameIds = Array.from(new Set((mine ?? []).map((r) => r.game_id)));
      if (cancelled || gameIds.length === 0) return;
      const { data: others } = await supabase
        .from('game_players')
        .select('session_id, player_name')
        .in('game_id', gameIds);
      if (cancelled || !others) return;
      addKnownFriends(
        others
          .filter((p) => p.session_id && p.session_id !== myId)
          .map((p) => ({ id: p.session_id as string, name: p.player_name })),
      );
    };
    void sync();
    return () => { cancelled = true; };
  }, [myId]);

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
      const { data: invites } = await supabase.rpc('list_invites_for_session', { p_session_id: myId });
      if (cancelled || !invites) return;

      const now = Date.now();
      const next: Record<string, { inviteId: string; gameId?: string }> = {};
      const acceptedGameIds: string[] = [];
      for (const inv of invites as Array<{ id: string; from_session_id: string; to_session_id: string; status: string; game_id: string | null; expires_at: string | null }>) {
        if (inv.from_session_id !== myId) continue;
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
    // Poll instead of realtime — direct SELECT on game_invites is locked down.
    const iv = setInterval(loadActive, 4000);

    return () => {
      cancelled = true;
      clearInterval(iv);
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
        sortAt: r.created_at,
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

    // Friends we have shared a game with but that have no (surviving) match
    // row — e.g. the match was cancelled or is still in the lobby. Saved
    // locally by both players, so a friend sticks regardless of who invited.
    for (const kf of knownFriends) {
      const id = resolveFriendId(kf.id, aliasMap);
      if (id === myId || hidden.has(id) || map.has(id)) continue;
      map.set(id, {
        opponentId: id,
        opponentName: kf.name,
        matches: 0, wins: 0, losses: 0, draws: 0,
        myHigh: 0,
        lastMatch: null,
        ongoingMatch: null,
        mergedSourceIds: [],
        sortAt: kf.addedAt,
      });
    }

    for (const [id, set] of sourceTracker) {
      const entry = map.get(id);
      if (entry) entry.mergedSourceIds = Array.from(set);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!!a.ongoingMatch !== !!b.ongoingMatch) return a.ongoingMatch ? -1 : 1;
      const aT = a.ongoingMatch?.created_at ?? a.lastMatch?.created_at ?? a.sortAt;
      const bT = b.ongoingMatch?.created_at ?? b.lastMatch?.created_at ?? b.sortAt;
      return new Date(bT).getTime() - new Date(aT).getTime();
    });
  }, [rows, myId, hiddenFriends, aliasMap, knownFriends]);

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
          const alreadyInvited = !!activeInvites[o.opponentId];
          const isSending = inviting === o.opponentId;
          return (
            <div
              key={o.opponentId}
              className={`w-full p-3 rounded-xl border ${
                o.ongoingMatch
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-secondary/60 border-border/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm text-foreground truncate">
                  {o.opponentName}
                </span>
              </div>

              <div className="flex items-stretch gap-2 mt-2">
                <button
                  onClick={() => navigate('/friend-stats', { state: { selectedId: o.opponentId } })}
                  className="flex-1 min-w-0 text-left active:opacity-80 transition"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col items-center justify-center rounded-xl bg-secondary/80 border border-border/50 py-2">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{t('friendsTotalMatches')}</span>
                      <span className="text-lg font-display font-black text-foreground tabular-nums">{o.matches}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center rounded-xl bg-secondary/80 border border-border/50 py-2">
                      <span className={`text-2xl font-display font-black tabular-nums ${
                        o.wins > o.losses ? 'text-game-success'
                          : o.losses > o.wins ? 'text-destructive'
                          : 'text-muted-foreground'
                      }`}>
                        {o.wins}–{o.losses}
                      </span>
                      {o.draws > 0 && (
                        <span className="text-[10px] font-bold text-muted-foreground">+{o.draws}</span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (alreadyInvited) {
                      reopenInvite(o.opponentId, o.opponentName);
                    } else {
                      handleInvite(o.opponentId, o.opponentName);
                    }
                  }}
                  disabled={isSending || !!pendingInvite}
                  className="flex-shrink-0 w-[4.5rem] rounded-lg bg-primary/15 text-primary border border-primary/30 active:bg-primary/25 transition flex flex-col items-center justify-center disabled:opacity-60"
                  aria-label={alreadyInvited ? t('inviteSent') : t('inviteFriend')}
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-bold leading-tight text-center">
                      {alreadyInvited ? t('inviteSent') : t('inviteFriend')}
                    </span>
                  )}
                </button>
              </div>
              {o.ongoingMatch ? (
                <div className="mt-2 pt-2 border-t border-primary/30 flex items-center justify-between text-[10px] uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-primary font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    {t('ongoingMatch')}
                  </span>
                  <span className="text-muted-foreground normal-case tracking-normal">
                    {formatDate(o.ongoingMatch.created_at)}
                  </span>
                </div>
              ) : null}
            </div>
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
