import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { roomAction, savedWaitingSeat } from '@/lib/waiting-room';

export function useWaitingRoomCount() {
  const [count, setCount] = useState(0);
  const [seated, setSeated] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let alive = true;
    let refreshing = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || refreshing) return;
      refreshing = true;
      const [countResult, membership] = await Promise.allSettled([
        supabase.rpc('waiting_room_count', { p_session_id: getSessionId() }),
        // sync validates the seat without joining, resetting ready, or marking presence.
        roomAction('sync', { seatId: savedWaitingSeat() }),
      ]);
      refreshing = false;
      if (!alive) return;
      if (countResult.status === 'fulfilled' && !countResult.value.error) setCount(countResult.value.data ?? 0);
      if (membership.status === 'fulfilled' && (!membership.value.error || membership.value.error === 'expired')) {
        setSeated(!!membership.value.mine && !membership.value.mine.game_id);
      }
      setChecking(false);
    };
    void refresh();
    const channel = supabase.channel('waiting-room-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiting_room_state' }, () => void refresh())
      .subscribe();
    const timer = setInterval(() => void refresh(), 10_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); void supabase.removeChannel(channel); };
  }, []);
  return { count, seated, checking };
}