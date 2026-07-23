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
    const load = async () => {
      const { data } = await supabase.rpc('list_invites_for_session', { p_session_id: sessionId });
      if (cancelled || !data) return;
      const now = Date.now();
      for (const row of data as InviteRow[]) {
        if (row.to_session_id !== sessionId) continue;
        if (row.status !== 'pending') continue;
        if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
        if (!handledRef.current.has(row.id)) {
          setQueue((cur) => (cur.some((r) => r.id === row.id) ? cur : [...cur, row]));
        }
      }
    };
    load();
    const iv = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [sessionId]);


  // Poll for status transitions on outbound invites I sent (accepted/declined)
  // and for cancellation/expiry of queued incoming invites. Realtime is no
  // longer used here since direct SELECT on game_invites is locked down.
  useEffect(() => {
    let cancelled = false;
    const seenOutbound = new Set<string>();
    const poll = async () => {
      const { data } = await supabase.rpc('list_invites_for_session', { p_session_id: sessionId });
      if (cancelled || !data) return;
      const rows = data as InviteRow[];

      // Outbound: I'm the sender
      for (const row of rows) {
        if (row.from_session_id !== sessionId) continue;
        const key = `${row.id}:${row.status}`;
        if (seenOutbound.has(key)) continue;
        seenOutbound.add(key);
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        if (ageMs > 11 * 60_000) continue;
        if (row.status === 'accepted' && row.game_id) {
          if (window.location.pathname.startsWith('/multiplayer-game')) {
            toast.success(t('invAcceptedOpenFromHome', { name: row.to_name }));
          } else {
            toast.success(t('invAccepted', { name: row.to_name }));
            navigate(`/multiplayer-game?gameId=${row.game_id}`);
          }
        } else if (row.status === 'declined') {
          toast.message(t('invDeclinedByOther', { name: row.to_name }));
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
    const iv = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [sessionId, navigate]);



  const handle = useCallback(
    async (action: 'accept' | 'decline') => {
      if (!incoming || busy) return;
      setBusy(true);
      handledRef.current.add(incoming.id);
      const res = await respondInvite({ inviteId: incoming.id, action });
      setBusy(false);
      const inv = incoming;
      setQueue((cur) => cur.filter((r) => r.id !== inv.id));
      if (!res.ok) {
        toast.error(res.error ?? t('errGeneric'));
        return;
      }
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
