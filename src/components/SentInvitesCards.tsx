import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';
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
    try {
      const res = await respondInvite({ inviteId: id, action: 'decline' });
      // Only drop the card once the server confirms; otherwise the invite is
      // still live and the friend could accept a "cancelled" invite.
      if (res.ok) setInvites((cur) => cur.filter((i) => i.id !== id));
      else toast.error(t('errorGeneric'));
    } catch {
      toast.error(t('errorGeneric'));
    } finally {
      setCancelling(null);
    }
  };

  if (invites.length === 0) return null;

  return (
    <div className="home-card-stack">
      <AnimatePresence initial={false}>
        {invites.map((inv) => (
          <motion.div
            key={inv.id}
            className="home-match-card home-match-card-info font-display"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="home-card-chip">
              <Send />
            </div>

            <div className="match-card-body flex-1 min-w-0 flex flex-col justify-center gap-[3px]">
              <p className="font-bold text-[11px] leading-none truncate">{inv.to_name}</p>
              <p className="flex items-center gap-1 text-[8px] leading-none opacity-90">
                <span className="w-1 h-1 rounded-full bg-background/80 animate-pulse flex-shrink-0" />
                <span className="truncate">{t('inviteSent')} · {t('waitingShort')}…</span>
                <Clock className="w-2.5 h-2.5 ml-0.5 flex-shrink-0" />
                <span className="tabular-nums flex-shrink-0">
                  {formatTimeRemaining(new Date(inv.expires_at).getTime() - Date.now())}
                </span>
              </p>
            </div>
            <button
              onClick={() => cancel(inv.id)}
              disabled={cancelling === inv.id}
              className="home-card-pill"
            >
              {cancelling === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('cancel')}
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
