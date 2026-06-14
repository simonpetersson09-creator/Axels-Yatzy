// Global overlay that listens for incoming friend invites and lets the user
// accept/decline them. Mounted once near the app root. Queues multiple pending
// invites and shows them one at a time.
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { respondInvite, type InviteRow } from '@/lib/invites';
import { toast } from 'sonner';

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

  // Look for ALL outstanding pending invites on mount (e.g. app was closed).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('game_invites')
        .select('*')
        .eq('to_session_id', sessionId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      if (cancelled || !data) return;
      for (const row of data) {
        if (!handledRef.current.has(row.id)) {
          setQueue((cur) => (cur.some((r) => r.id === row.id) ? cur : [...cur, row as InviteRow]));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Realtime: incoming invites addressed to me — INSERT (new) + UPDATE (cancelled/expired)
  useEffect(() => {
    const ch = supabase
      .channel(`invites-in-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_invites', filter: `to_session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as InviteRow;
          if (row.status !== 'pending') return;
          enqueue(row);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_invites', filter: `to_session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as InviteRow;
          if (row.status === 'pending') return;
          setQueue((cur) => {
            const idx = cur.findIndex((r) => r.id === row.id);
            if (idx === -1) return cur;
            handledRef.current.add(row.id);
            if (row.status === 'cancelled' && idx === 0) {
              toast.message(`${row.from_name} avbröt inbjudan`);
            }
            const next = [...cur];
            next.splice(idx, 1);
            return next;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, enqueue]);

  // Realtime: outbound invites I sent — auto-navigate when accepted
  useEffect(() => {
    const ch = supabase
      .channel(`invites-out-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_invites', filter: `from_session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as InviteRow;
          const ageMs = Date.now() - new Date(row.created_at).getTime();
          if (ageMs > 11 * 60_000) return;
          if (row.status === 'accepted' && row.game_id) {
            if (window.location.pathname.startsWith('/multiplayer-game')) {
              toast.success(`${row.to_name} accepterade! Öppna inbjudan från startsidan.`);
              return;
            }
            toast.success(`${row.to_name} accepterade!`);
            navigate(`/multiplayer-game?gameId=${row.game_id}`);
          } else if (row.status === 'declined') {
            toast.message(`${row.to_name} kunde inte spela just nu`);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
        toast.error(res.error ?? 'Något gick fel');
        return;
      }
      if (action === 'accept' && res.gameId) {
        navigate(`/multiplayer-game?gameId=${res.gameId}`);
      } else if (action === 'decline') {
        toast.message(`Avböjde inbjudan från ${inv.from_name}`);
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
          onClick={() => !busy && handle('decline')}
        >
          <motion.div
            className="w-full max-w-sm rounded-3xl bg-card border border-border/60 p-6 shadow-2xl"
            initial={{ y: 40, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Gamepad2 className="w-7 h-7 text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-display font-black text-foreground">
                  Spelinbjudan
                </h2>
                <p className="text-sm text-muted-foreground">
                  <span className="font-bold text-foreground">{incoming.from_name}</span> vill spela Yatzy med dig
                </p>
                {queue.length > 1 && (
                  <p className="text-[11px] text-muted-foreground/70 pt-1">
                    +{queue.length - 1} fler inbjudan{queue.length - 1 === 1 ? '' : 'ar'} väntar
                  </p>
                )}
              </div>
              <div className="w-full flex gap-2.5 pt-2">
                <button
                  onClick={() => handle('decline')}
                  disabled={busy}
                  className="flex-1 py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-display font-bold inline-flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                >
                  <X className="w-4 h-4" /> Avböj
                </button>
                <button
                  onClick={() => handle('accept')}
                  disabled={busy}
                  className="flex-1 py-3.5 rounded-2xl bg-primary text-primary-foreground font-display font-bold inline-flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Acceptera
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
