// Global overlay that listens for incoming friend invites and lets the user
// accept/decline them. Mounted once near the app root. Queues multiple pending
// invites and shows them one at a time.
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { respondInvite, type InviteRow } from '@/lib/invites';
import { toast } from 'sonner';
import { t } from '@/lib/i18n';

// Outbound invite transitions (accepted/declined) must only ever be acted on
// once per device — otherwise a remount or a fresh app start replays the
// "X accepterade" toast and re-navigates into an old match, which makes it
// impossible to get back to the lobby.
const SEEN_KEY = 'yatzy_seen_outbound_invites';

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function wasOutboundHandled(key: string): boolean {
  return readSeen().includes(key);
}

function markOutboundHandled(key: string) {
  try {
    const list = readSeen();
    if (list.includes(key)) return;
    localStorage.setItem(SEEN_KEY, JSON.stringify([...list, key].slice(-100)));
  } catch {
    /* ignore */
  }
}

// Both pollers below need the exact same row set. They used to fire two
// separate RPCs every 3 s and 4 s, i.e. ~0.6 network round-trips per second for
// the entire lifetime of the app — on iOS that constant JSON parsing + state
// churn showed up as general stutter. They now share one in-flight request and
// a short result cache, and they never poll while the app is backgrounded.
let invitesCache: { at: number; rows: InviteRow[] } = { at: 0, rows: [] };
let invitesInFlight: Promise<InviteRow[]> | null = null;
const INVITES_CACHE_MS = 2500;

async function fetchInvites(sessionId: string, force = false): Promise<InviteRow[]> {
  if (!force && Date.now() - invitesCache.at < INVITES_CACHE_MS) return invitesCache.rows;
  if (invitesInFlight) return invitesInFlight;
  invitesInFlight = (async () => {
    try {
      const { data } = await supabase.rpc('list_invites_for_session', { p_session_id: sessionId });
      invitesCache = { at: Date.now(), rows: (data ?? []) as InviteRow[] };
    } catch {
      /* keep previous rows on a transient failure */
    } finally {
      invitesInFlight = null;
    }
    return invitesCache.rows;
  })();
  return invitesInFlight;
}

export default function InviteOverlay() {

  const navigate = useNavigate();
  const [queue, setQueue] = useState<InviteRow[]>([]);
  const [busy, setBusy] = useState(false);
  const handledRef = useRef<Set<string>>(new Set());
  const sessionId = getSessionId();
  const incoming = queue[0] ?? null;


  const enqueue = useCallback((row: InviteRow) => {
    if (handledRef.current.has(row.id)) return;
    setQueue((cur) => (cur.some((r) => r.id === row.id) ? cur : [...cur, row]));
  }, []);

  // Poll for outstanding pending invites (SELECT on game_invites is locked down;
  // access goes through the SECURITY DEFINER RPC list_invites_for_session).
  useEffect(() => {
    let cancelled = false;
    const load = async (force = false) => {
      if (!force && document.hidden) return;
      const data = await fetchInvites(sessionId, force);
      if (cancelled || !data) return;
      const now = Date.now();
      for (const row of data) {
        if (row.to_session_id !== sessionId) continue;
        if (row.status !== 'pending') continue;
        if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
        if (!handledRef.current.has(row.id)) {
          setQueue((cur) => (cur.some((r) => r.id === row.id) ? cur : [...cur, row]));
        }
      }
    };
    void load(true);
    const iv = setInterval(() => void load(), 5000);
    // Refresh immediately when the app returns to the foreground / tab is refocused
    // so a pending invite shows up the moment the user opens the app.
    const onFocus = () => { if (!document.hidden) void load(true); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    let removeCap: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import('@capacitor/app');
        const sub = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void load();
        });
        removeCap = () => { void sub.remove(); };
      } catch {
        /* ignore — web fallback via focus/visibilitychange already covers this */
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      removeCap?.();
    };
  }, [sessionId]);

  // Push tap → surface the matching invite immediately (jump it to the front of
  // the queue and fetch it if we haven't polled it yet).
  useEffect(() => {
    const handler = async (e: Event) => {
      const inviteId = (e as CustomEvent<{ inviteId?: string }>).detail?.inviteId;
      if (!inviteId) return;
      handledRef.current.delete(inviteId);
      const { data } = await supabase.rpc('list_invites_for_session', { p_session_id: sessionId });
      const rows = (data ?? []) as InviteRow[];
      const row = rows.find((r) => r.id === inviteId);
      if (!row || row.to_session_id !== sessionId || row.status !== 'pending') {
        toast.message('Inbjudan är inte längre aktiv');
        return;
      }
      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        toast.message('Inbjudan har gått ut');
        return;
      }
      setQueue((cur) => {
        const rest = cur.filter((r) => r.id !== row.id);
        return [row, ...rest];
      });
    };
    window.addEventListener('app:invite-tap', handler);
    return () => window.removeEventListener('app:invite-tap', handler);
  }, [sessionId]);


  // Poll for status transitions on outbound invites I sent (accepted/declined)
  // and for cancellation/expiry of queued incoming invites. Realtime is no
  // longer used here since direct SELECT on game_invites is locked down.
  useEffect(() => {
    let cancelled = false;
    const seenOutbound = new Set<string>();
    const poll = async (force = false) => {
      if (!force && document.hidden) return;
      const rows = await fetchInvites(sessionId, force);
      if (cancelled || !rows) return;


      // Outbound: I'm the sender
      for (const row of rows) {
        if (row.from_session_id !== sessionId) continue;
        const key = `${row.id}:${row.status}`;
        if (seenOutbound.has(key) || wasOutboundHandled(key)) continue;
        seenOutbound.add(key);
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        if (ageMs > 7 * 3600_000) { markOutboundHandled(key); continue; }
        if (row.status === 'accepted' && row.game_id) {
          // Never yank the user into a match that is already over — a finished
          // or forfeited game would otherwise bounce them out of the lobby.
          const { data: g, error: gErr } = await supabase
            .from('games')
            .select('status')
            .eq('id', row.game_id)
            .maybeSingle();
          // Transient lookup failure: do NOT burn the key — otherwise a single
          // network blip means this accept can never open the match again.
          if (gErr) { seenOutbound.delete(key); continue; }
          markOutboundHandled(key);
          if (!g || g.status === 'finished') continue;
          // Only skip navigation when we're already inside *this* match —
          // being on another game screen must not swallow the new match.
          const params = new URLSearchParams(window.location.search);
          const alreadyInThisGame =
            window.location.pathname.startsWith('/multiplayer-game') &&
            params.get('gameId') === row.game_id;
          if (alreadyInThisGame) {
            toast.success(t('invAcceptedOpenFromHome', { name: row.to_name }));
          } else {
            toast.success(t('invAccepted', { name: row.to_name }));
            navigate(`/multiplayer-game?gameId=${row.game_id}`);
          }
        } else {
          markOutboundHandled(key);
          if (row.status === 'declined') {
            toast.message(t('invDeclinedByOther', { name: row.to_name }));
          }
        }
      }


      // Inbound queued: remove if no longer pending
      setQueue((cur) => {
        if (cur.length === 0) return cur;
        const stillPending = new Set(
          rows.filter((r) => r.to_session_id === sessionId && r.status === 'pending').map((r) => r.id),
        );
        const next = cur.filter((r) => {
          if (stillPending.has(r.id)) return true;
          handledRef.current.add(r.id);
          const upd = rows.find((x) => x.id === r.id);
          if (upd && upd.status === 'cancelled' && cur[0]?.id === r.id) {
            toast.message(t('invCancelledBy', { name: upd.from_name }));
          }
          return false;
        });
        return next.length === cur.length ? cur : next;
      });
    };
    poll();
    const iv = setInterval(poll, 3000);
    // Also poll the moment the app/tab returns to the foreground so an accept
    // that happened while we were backgrounded opens the match immediately.
    const onForeground = () => { void poll(); };
    window.addEventListener('focus', onForeground);
    document.addEventListener('visibilitychange', onForeground);
    let removeCap: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import('@capacitor/app');
        const sub = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void poll();
        });
        removeCap = () => { void sub.remove(); };
      } catch {
        /* ignore — focus/visibilitychange covers web */
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener('focus', onForeground);
      document.removeEventListener('visibilitychange', onForeground);
      removeCap?.();
    };
  }, [sessionId, navigate]);




  const handle = useCallback(
    async (action: 'accept' | 'decline') => {
      if (!incoming || busy) return;
      setBusy(true);
      const inv = incoming;
      const res = await respondInvite({ inviteId: inv.id, action });
      setBusy(false);
      if (!res.ok) {
        // Keep invite in queue so the user can retry after a network hiccup.
        toast.error(res.error ?? t('errGeneric'));
        return;
      }
      handledRef.current.add(inv.id);
      setQueue((cur) => cur.filter((r) => r.id !== inv.id));
      if (action === 'accept' && res.gameId) {
        navigate(`/multiplayer-game?gameId=${res.gameId}`);
      } else if (action === 'decline') {
        toast.message(t('invDeclinedToast', { name: inv.from_name }));
      }
    },
    [incoming, busy, navigate],
  );

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          key={incoming.id}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop tap does NOT decline — that requires an explicit button
              press. Misplaced taps used to permanently decline invites. */}
          <motion.div
            className="w-full max-w-sm rounded-3xl bg-card border border-border/60 p-6 shadow-2xl"
            initial={{ y: 40, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <motion.div
                className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 border-2 border-primary/40 flex items-center justify-center shadow-lg shadow-primary/30"
                initial={{ scale: 0.6, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              >
                <span className="text-2xl font-display font-black text-primary-foreground select-none">
                  {(incoming.from_name?.trim()?.charAt(0) || '?').toUpperCase()}
                </span>
              </motion.div>
              <div className="space-y-1">
                <h2 className="text-lg font-display font-black text-foreground">
                  {t('inviteTitle')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('inviteWantsToPlay', { name: incoming.from_name })}
                </p>
                {queue.length > 1 && (
                  <p className="text-[11px] text-muted-foreground/70 pt-1">
                    {t('moreInvitesWaiting', { count: queue.length - 1 })}
                  </p>
                )}
              </div>
              <div className="w-full flex gap-2.5 pt-2">
                <button
                  onClick={() => handle('decline')}
                  disabled={busy}
                  className="flex-1 py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-display font-bold inline-flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                >
                  <X className="w-4 h-4" /> {t('decline')}
                </button>
                <button
                  onClick={() => handle('accept')}
                  disabled={busy}
                  className="flex-1 py-3.5 rounded-2xl bg-primary text-primary-foreground font-display font-bold inline-flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> {t('accept')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
