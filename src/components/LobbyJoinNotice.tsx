import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { getSessionId } from '@/lib/session';

/**
 * Anywhere in the app except the waiting room itself: tells the host once when
 * a friend joins their open waiting room (phone push covers the app being closed).
 * Checks when the app opens or returns to the foreground; only while a waiting
 * room is actually open does it keep polling every 8 s. No polling otherwise.
 */
export function LobbyJoinNotice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const counts = useRef<Record<string, number> | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const me = getSessionId();
      const { data } = await supabase
        .from('game_players')
        .select('game_id, player_index, games!inner(status, game_code, game_players(player_name, session_id, player_index))')
        .eq('session_id', me).eq('player_index', 0).eq('games.status', 'waiting');
      if (!alive || !data) return;
      const prev = counts.current;
      const next: Record<string, number> = {};
      for (const row of data as any[]) {
        const g = Array.isArray(row.games) ? row.games[0] : row.games;
        const players = (g?.game_players ?? []) as { player_name: string; session_id: string; player_index: number }[];
        next[row.game_id] = players.length;
        const before = prev?.[row.game_id] ?? (prev ? 1 : players.length);
        if (prev && players.length > before && !pathRef.current.startsWith('/multiplayer') && g?.game_code) {
          const joiner = [...players].sort((a, b) => b.player_index - a.player_index).find((p) => p.session_id !== me);
          toast(t('lobbyFriendJoined', { name: joiner?.player_name || '?' }), {
            duration: 10000,
            action: { label: t('hofShow'), onClick: () => navigate('/multiplayer', { state: { rejoinCode: g.game_code } }) },
          });
        }
      }
      counts.current = next;
    };
    const loop = async () => {
      await check().catch(() => {});
      if (!alive) return;
      // Fast polling only while the player actually has an open waiting room.
      const hasLobby = !!counts.current && Object.keys(counts.current).length > 0;
      timer = setTimeout(() => void loop(), hasLobby ? 8000 : 60000);
    };
    void loop();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [navigate, t]);
  return null;
}
