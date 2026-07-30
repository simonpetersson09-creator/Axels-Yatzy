import { supabase } from '@/integrations/supabase/client';
import { initDeviceId } from '@/lib/device';

const SESSION_KEY = 'yatzy_session_id';
const PLAYER_NAME_KEY = 'yatzy_player_name';

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

let claimPromise: Promise<boolean> | null = null;

/**
 * Bind this session id to this device server-side (first claim wins).
 * Prevents anyone who reads a public session id from hijacking its
 * push notifications or leaderboard stats.
 */
export function claimSession(): Promise<boolean> {
  if (!claimPromise) {
    claimPromise = (async () => {
      try {
        const deviceId = await initDeviceId();
        const { data, error } = await supabase.rpc('claim_session', {
          p_session_id: getSessionId(),
          p_device_id: deviceId,
        });
        if (error) return false;
        return !!data;
      } catch {
        return false;
      }
    })();
  }
  return claimPromise;
}


// Kept as a thin wrapper for backwards compatibility.
// Profile data now lives in src/lib/profile.ts (local-only, no auth).
export function getPlayerName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) || '';
}

export function setPlayerName(name: string): void {
  localStorage.setItem(PLAYER_NAME_KEY, name.trim());
}
