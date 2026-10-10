import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Clock } from 'lucide-react';
import { formatTimeRemaining } from '@/lib/active-game';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { respondInvite, type InviteRow } from '@/lib/invites';
import { useTranslation } from '@/lib/i18n';

const CACHE_KEY = 'yatzy-sent-invites';

function readCache(myId: string): InviteRow[] {
  try {
    const list = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') as InviteRow[];
    const now = Date.now();
    return Array.isArray(list)
      ? list.filter((i) => i.from_session_id === myId && new Date(i.expires_at).getTime() > now)
      : [];
  } catch {
    return [];
  }
}

function writeCache(list: InviteRow[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

/**
 * Home-screen cards for invitations I have sent that are still waiting for
 * an answer — so a minimized invite doesn't just disappear.
 */
export function SentInvitesCards() {
  const { t } = useTranslation();
  const myId = getSessionId();
  // Start from the last known list so the cards are there on first paint and
  // the buttons below don't jump down when the server answers.
  const [invites, setInvites] = useState<InviteRow[]>(() => readCache(myId));
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc('list_invites_for_session', { p_session_id: myId });
      if (cancelled || !data) return;
      const now = Date.now();
      const list = (data as InviteRow[]).filter(
        (i) => i.from_session_id === myId && i.status === 'pending' && new Date(i.expires_at).getTime() > now,
      );
      writeCache(list);
      setInvites(list);
    };
    void load();
    const iv = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [myId]);

  const cancel = async (id: string) => {
    if (cancelling) return;
    setCancelling(id);
    await respondInvite({ inviteId: id, action: 'decline' });
    setInvites((cur) => cur.filter((i) => i.id !== id));
    setCancelling(null);
  };

  if (invites.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <AnimatePresence initial={false}>
        {invites.map((inv) => (
          <motion.div
            key={inv.id}
            className="w-full px-3 py-1.5 rounded-xl flex items-center gap-2.5 text-left bg-secondary/70 text-foreground border border-border/60 border-l-4 border-l-primary/80"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-primary/15">
              <Send className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-sm truncate">{inv.to_name}</p>
              <p className="flex items-center gap-1 mt-px text-[10px] text-muted-foreground/80">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="truncate">{t('inviteSent')} · {t('waitingShort')}…</span>
                <Clock className="w-3 h-3 ml-1 flex-shrink-0" />
                <span className="tabular-nums flex-shrink-0">
                  {formatTimeRemaining(new Date(inv.expires_at).getTime() - Date.now())}
                </span>
              </p>
            </div>
            <button
              onClick={() => cancel(inv.id)}
              disabled={cancelling === inv.id}
              className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-muted/70 text-muted-foreground active:scale-95 transition disabled:opacity-60"
            >
              {cancelling === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('cancel')}
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
