import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { listFriendRequests, respondFriendRequest, type FriendRequest } from '@/lib/friend-requests';

/** Incoming and sent friend requests, shown at the top of the friends list. */
export function FriendRequestsList() {
  const { t } = useTranslation();
  const [list, setList] = useState<FriendRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => listFriendRequests().then((l) => { if (alive) setList(l); });
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const shown = list.filter((r) => r.status === 'pending');
  if (!shown.length) return null;

  const respond = async (r: FriendRequest, accept: boolean) => {
    if (busy) return;
    setBusy(r.id);
    const ok = await respondFriendRequest(r, accept);
    setBusy(null);
    if (!ok) { toast.error(t('errGeneric')); return; }
    if (accept) toast.success(t('strangerFriendAdded', { name: r.otherName }));
    setList((l) => l.filter((x) => x.id !== r.id));
  };

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('friendRequestsTitle')}</h2>
      {shown.map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3 py-2">
          <UserPlus className="w-4 h-4 text-primary shrink-0" />
          <p className="flex-1 min-w-0 text-sm text-foreground truncate">
            {r.incoming ? t('friendRequestFrom', { name: r.otherName }) : `${r.otherName} · ${t('friendRequestPending')}`}
          </p>
          {r.incoming && (
            <div className="flex gap-1.5 shrink-0">
              <button disabled={busy === r.id} onClick={() => respond(r, false)} className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground active:scale-95">{t('decline')}</button>
              <button disabled={busy === r.id} onClick={() => respond(r, true)} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground active:scale-95">{t('accept')}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
