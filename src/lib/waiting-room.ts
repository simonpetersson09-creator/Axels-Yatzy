import { supabase } from '@/integrations/supabase/client';
import { initDeviceId } from '@/lib/device';
import { getSessionId, getPlayerName, getAnonNumber } from '@/lib/session';
import { t } from '@/lib/i18n';
import type { WaitingPlayer } from './waiting-room-rules';

export interface WaitingSeat extends WaitingPlayer { game_id: string | null; notify_enabled: boolean }
export interface WaitingSnapshot {
  error: string | null; server_now: string; countdown_at: string | null;
  push_registered: boolean; mine: WaitingSeat | null; players: WaitingPlayer[];
}
export type RoomAction = 'sync' | 'join' | 'open' | 'heartbeat' | 'ready' | 'away' | 'leave' | 'extend' | 'notify';
const SEAT_KEY = 'yatzy_waiting_seat';
export function savedWaitingSeat() { return localStorage.getItem(SEAT_KEY); }
export async function roomAction(action: RoomAction, opts: { seatId?: string | null; ready?: boolean; notify?: boolean } = {}): Promise<WaitingSnapshot> {
  const { data, error } = await supabase.rpc('waiting_room_action', {
    p_session_id: getSessionId(), p_device_id: await initDeviceId(), p_action: action,
    p_seat_id: opts.seatId ?? undefined, p_ready: opts.ready ?? false, p_notify: opts.notify ?? false,
    p_name: getPlayerName() || t('playerN', { n: getAnonNumber() }),
  });
  if (error) throw new Error(error.message);
  const snapshot = data as unknown as WaitingSnapshot;
  if (snapshot.mine) localStorage.setItem(SEAT_KEY, snapshot.mine.id);
  else if (action === 'leave' || snapshot.error === 'expired') localStorage.removeItem(SEAT_KEY);
  return snapshot;
}

// Durable handoff if a native cold-start tap arrives before React mounts.
const NAV_KEY = 'yatzy_waiting_notification';
let launchProtectionUntil = 0;
export function waitingRoomAdBlocked() {
  return window.location.pathname === '/waiting-room' || Date.now() < launchProtectionUntil;
}
export function waitingRoomNotification(seatId: string) {
  launchProtectionUntil = Date.now() + 60_000;
  sessionStorage.setItem(NAV_KEY, seatId);
  window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: `/waiting-room?seat=${encodeURIComponent(seatId)}` } }));
}
export function consumeWaitingNotification() {
  const seat = sessionStorage.getItem(NAV_KEY);
  sessionStorage.removeItem(NAV_KEY);
  return seat;
}