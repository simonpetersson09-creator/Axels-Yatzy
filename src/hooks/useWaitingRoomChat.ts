import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { readWaitingMessage, type WaitingPhrase } from '@/lib/waiting-room-chat';
import type { WaitingPlayer } from '@/lib/waiting-room-rules';

export function useWaitingRoomChat(players: WaitingPlayer[], mineId: string | null) {
  const [bubbles, setBubbles] = useState<Record<string, { phrase: WaitingPhrase; until: number }>>({});
  const [connected, setConnected] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null);
  const currentPlayers = useRef(players);
  currentPlayers.current = players;
  const lastSent = useRef(0);
  const received = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!mineId) return;
    const ch = supabase.channel('waiting-room-quick-chat', { config: { broadcast: { self: false, ack: true } } });
    ch.on('broadcast', { event: 'phrase' }, ({ payload }) => {
      const msg = readWaitingMessage(payload, currentPlayers.current);
      if (!msg || Date.now() - (received.current[msg.seatId] ?? 0) < 4000) return;
      received.current[msg.seatId] = Date.now();
      setBubbles(prev => ({ ...prev, [msg.seatId]: { phrase: msg.phrase, until: Date.now() + 3500 } }));
    }).subscribe(status => setConnected(status === 'SUBSCRIBED'));
    channel.current = ch;
    const timer = setInterval(() => setBubbles(prev => {
      const entries = Object.entries(prev).filter(([, b]) => b.until > Date.now());
      return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
    }), 250);
    return () => { clearInterval(timer); void supabase.removeChannel(ch); channel.current = null; setConnected(false); setBubbles({}); };
  }, [mineId]);
  const send = async (phrase: WaitingPhrase) => {
    if (!mineId || !connected || !channel.current || Date.now() - lastSent.current < 4000) return false;
    lastSent.current = Date.now();
    const result = await channel.current.send({ type: 'broadcast', event: 'phrase', payload: { seatId: mineId, phrase } });
    if (result !== 'ok') return false;
    setBubbles(prev => ({ ...prev, [mineId]: { phrase, until: Date.now() + 3500 } }));
    return true;
  };
  return { bubbles, send, connected };
}