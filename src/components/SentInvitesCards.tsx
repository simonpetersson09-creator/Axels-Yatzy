import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cancelLobby } from '@/lib/friend-requests';
import { groupHomeInvites, type OpenLobby } from '@/lib/home-invite-groups';
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
      ? list.filter((i) => i.from_session_id === myId && i.status === 'pending' && new Date(i.expires_at).getTime() > now)
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
export function SentInvitesCards({ openLobbies = [], onLobbyClosed }: {
  openLobbies?: OpenLobby[];
  onLobbyClosed?: (gameId: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = getSessionId();
  // Start from the last known list so the cards are there on first paint and
  // the buttons below don't jump down when the server answers.
  const [invites, setInvites] = useState<InviteRow[]>(() => readCache(myId));
  const [cancelling, setCancelling] = useState<string | null>(null);
  const cancellingRef = useRef(false);
  const removedIds = useRef(new Set<string>());
  const { byLobby, standalone } = groupHomeInvites(invites, openLobbies);

  useEffect(() => {
    const deadlines = invites.map(row => new Date(row.expires_at).getTime()).filter(Number.isFinite);
    if (!deadlines.length) return;
    const timer = setTimeout(() => setInvites(current => {
      const next = current.filter(row => new Date(row.expires_at).getTime() > Date.now());
      writeCache(next);
      return next;
    }), Math.min(2_147_483_647, Math.max(0, Math.min(...deadlines) - Date.now())));
    return () => clearTimeout(timer);
  }, [invites]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
      const { data, error } = await supabase.rpc('list_invites_for_session', { p_session_id: myId });
      if (cancelled || error || !Array.isArray(data) || cancellingRef.current) return;
      const now = Date.now();
      const list = (data as InviteRow[]).filter(
        (i) => !removedIds.current.has(i.id) && i.from_session_id === myId && i.status === 'pending' && new Date(i.expires_at).getTime() > now,
      );
      writeCache(list);
      setInvites(list);
      } catch { /* preserve valid cached invites; expiry remains independent */ }
    };
    void load();
    const iv = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [myId]);

  const cancel = async (id: string) => {
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    setCancelling(id);
    try {
      const res = await respondInvite({ inviteId: id, action: 'decline' });
      // Only drop the card once the server confirms; otherwise the invite is
      // still live and the friend could accept a "cancelled" invite.
      if (res.ok) {
        removedIds.current.add(id);
        setInvites((cur) => {
          const next = cur.filter((i) => i.id !== id);
          writeCache(next);
          return next;
        });
      }
      else toast.error(t('errorGeneric'));
    } catch {
      toast.error(t('errorGeneric'));
    } finally {
      cancellingRef.current = false;
      setCancelling(null);
    }
  };

  const closeLobby = async (lobby: OpenLobby) => {
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    setCancelling(lobby.gameId);
    try {
      // Withdraw invitations first. On failure keep the game and remaining
      // invitations visible, so the user can retry rather than lose controls.
      for (const invite of byLobby.get(lobby.gameId) ?? []) {
        const result = await respondInvite({ inviteId: invite.id, action: 'decline' });
        if (!result.ok) { toast.error(t('errorGeneric')); return; }
        removedIds.current.add(invite.id);
        setInvites(current => {
          const next = current.filter(row => row.id !== invite.id);
          writeCache(next);
          return next;
        });
      }
      if (await cancelLobby(lobby.gameId)) onLobbyClosed?.(lobby.gameId);
      else toast.error(t('errorGeneric'));
    } catch {
      toast.error(t('errorGeneric'));
    } finally {
      cancellingRef.current = false;
      setCancelling(null);
    }
  };

  if (invites.length === 0 && openLobbies.length === 0) return null;

  return (
    <div className="home-card-stack">
      <AnimatePresence initial={false}>
        {openLobbies.map(lobby => {
          const names = (byLobby.get(lobby.gameId) ?? []).map(invite => invite.to_name).join(', ');
          const waiting = names ? t('inviteWaitingTitle', { name: names }) : `${t('waitingShort')}…`;
          return (
            <motion.div key={lobby.gameId} className="home-match-card home-match-card-info font-display"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
              <Button variant="ghost" disabled={cancelling !== null}
                onClick={() => navigate('/multiplayer', { state: { rejoinCode: lobby.code } })}
                className="flex-1 min-w-0 h-full justify-start gap-2 px-0 py-0 text-left hover:bg-transparent">
                <div className="home-card-chip"><Users /></div>
                <div className="match-card-body flex-1 min-w-0 flex flex-col justify-center gap-[3px]">
                  <p className="font-bold text-[11px] leading-none truncate">{t('lobbyOpenCard', { code: lobby.code })}</p>
                  <p className="flex items-center gap-1 text-[8px] leading-none opacity-90">
                    <span className="w-1 h-1 rounded-full bg-background/80 animate-pulse flex-shrink-0" />
                    <span className="truncate" title={waiting}>{waiting}</span>
                  </p>
                </div>
              </Button>
              <Button variant="ghost" disabled={cancelling !== null} onClick={() => closeLobby(lobby)}
                className="home-card-pill h-auto">
                {cancelling === lobby.gameId ? <Loader2 className="w-3 h-3 animate-spin" /> : t('close')}
              </Button>
            </motion.div>
          );
        })}
        {standalone.map((inv) => (
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
            <Button variant="ghost"
              onClick={() => cancel(inv.id)}
              disabled={cancelling !== null}
              className="home-card-pill h-auto"
            >
              {cancelling === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('cancel')}
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
