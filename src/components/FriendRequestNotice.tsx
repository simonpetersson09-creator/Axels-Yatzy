import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { listFriendRequests } from '@/lib/friend-requests';

const SEEN_KEY = 'yatzy_seen_friend_requests';

function getSeen(): string[] {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Shows each new incoming friend request once on the home screen. */
export function FriendRequestNotice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const list = await listFriendRequests();
      if (!alive) return;
      const seen = new Set(getSeen());
      const fresh = list.filter((r) => r.incoming && r.status === 'pending' && !seen.has(r.id));
      if (!fresh.length) return;
      fresh.forEach((r) => seen.add(r.id));
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-100))); } catch { /* ignore */ }
      toast(t('friendRequestFrom', { name: fresh[0].otherName }), {
        duration: 8000,
        action: { label: t('hofShow'), onClick: () => navigate('/friends') },
      });
    };
    void check();
    const id = setInterval(check, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [navigate, t]);
  return null;
}
