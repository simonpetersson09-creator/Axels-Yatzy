import { useEffect, useRef, useState } from 'react';
import { UserPlus, Send, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAcceptedFriends } from '@/lib/accepted-friends';
import { useTranslation } from '@/lib/i18n';
import { lobbyInviteCopy } from '@/lib/lobby-invite-copy';
import { getSessionId } from '@/lib/session';
import { sendLobbyInvites, type InviteRow } from '@/lib/invites';
import { supabase } from '@/integrations/supabase/client';
import { useBackHandler } from '@/lib/back-handler';
import type { Player } from '@/types/yatzy';

export function LobbyFriendInvites({ gameId, players }: { gameId: string; players: Player[] }) {
  const { requests } = useAcceptedFriends();
  const { t, lang } = useTranslation();
  const copy = lobbyInviteCopy(lang);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [seated, setSeated] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const refresh = useRef<() => Promise<void>>(async () => {});
  useBackHandler(open, () => { if (!busyRef.current) setOpen(false); });
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let loading = false;
    const load = async () => {
      if (loading || document.hidden) return;
      loading = true;
      try {
        const [result, seats] = await Promise.all([
          supabase.rpc('list_invites_for_session', { p_session_id: getSessionId() }),
          supabase.from('game_players').select('session_id').eq('game_id', gameId),
        ]);
        if (!cancelled && !result.error) setInvites(((result.data ?? []) as InviteRow[]).filter(i => i.game_id === gameId && i.lobby_invite));
        if (!cancelled && !seats.error) setSeated((seats.data ?? []).map(p => p.session_id));
      } catch { /* Keep confirmed status on a temporary connection failure. */ }
      finally { loading = false; }
    };
    refresh.current = load;
    void load();
    const timer = setInterval(() => void load(), 5000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => { cancelled = true; alive.current = false; clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, [gameId, players.length]);
  const pending = invites.filter(i => i.status === 'pending' && Date.parse(i.expires_at) > Date.now() && !seated.includes(i.to_session_id));
  const pendingIds = new Set(pending.map(i => i.to_session_id));
  const friends = requests.filter(r => r.status === 'accepted' && !seated.includes(r.otherId));
  const free = Math.max(0, 4 - players.length - pendingIds.size);
  const availableSelected = selected.filter(id => friends.some(f => f.otherId === id) && !pendingIds.has(id)).slice(0, free);
  const send = async () => {
    if (busyRef.current || !availableSelected.length) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = await sendLobbyInvites(gameId, availableSelected);
      if (!alive.current) return;
      if (!result.ok) { setError(result.error ?? t('errSendInvite')); return; }
      // Immediate local status prevents another selection before the read-back.
      setInvites(cur => [...cur, ...availableSelected.map(id => ({ id: `sending:${id}`, game_id: gameId, lobby_invite: true, from_session_id: getSessionId(), from_name: '', to_session_id: id, to_name: friends.find(f => f.otherId === id)?.otherName ?? '', status: 'pending' as const, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(), responded_at: null }))]);
      setSelected([]);
      await refresh.current();
    } catch { if (alive.current) setError(t('errSendInvite')); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  return (
    <section className="space-y-3">
      <Button variant="secondary" className="w-full" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <UserPlus />{copy.invite}
      </Button>
      {pending.length > 0 && <ul className="space-y-2">{pending.map(i => <li key={i.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{i.to_name}</span><span className="text-xs text-muted-foreground">{t('friendRequestPending')}</span></li>)}</ul>}
      {open && <div className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-semibold">{t('friends')}</h2><Button variant="ghost" size="icon" aria-label={t('cancel')} onClick={() => setOpen(false)} disabled={busy}><X /></Button></div>
        {friends.length === 0 ? <p className="text-sm text-muted-foreground">{t('friendStatsEmpty')}</p> : <div className="max-h-60 overflow-y-auto space-y-1">
          {friends.map(f => <label key={f.otherId} className="flex items-center gap-3 py-2 border-b border-border">
            <input type="checkbox" className="h-4 w-4 accent-primary shrink-0" checked={availableSelected.includes(f.otherId)} disabled={busy || pendingIds.has(f.otherId) || (!availableSelected.includes(f.otherId) && availableSelected.length >= free)} onChange={() => setSelected(cur => cur.includes(f.otherId) ? cur.filter(id => id !== f.otherId) : [...availableSelected, f.otherId])} />
            <span className="flex-1 min-w-0 break-words text-sm">{f.otherName}</span>
            {pendingIds.has(f.otherId) && <span className="text-xs text-muted-foreground">{t('inviteSent')}</span>}
          </label>)}
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full h-auto min-h-10 whitespace-normal" disabled={busy || !availableSelected.length} onClick={() => void send()}>{busy ? <Loader2 className="animate-spin" /> : <Send />}{copy.send}{availableSelected.length > 0 && ` (${availableSelected.length})`}</Button>
      </div>}
    </section>
  );
}