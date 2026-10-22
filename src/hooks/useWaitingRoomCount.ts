import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';

export function useWaitingRoomCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data, error } = await supabase.rpc('waiting_room_count', { p_session_id: getSessionId() });
      if (alive && !error) setCount(data ?? 0);
    };
    void refresh();
    const channel = supabase.channel('waiting-room-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiting_room_state' }, () => void refresh())
      .subscribe();
    const timer = setInterval(() => void refresh(), 10_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); void supabase.removeChannel(channel); };
  }, []);
  return count;
}