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
let claimedSessionId: string | null = null;

/**
 * Bind this session id to this device server-side (first claim wins).
 * Prevents anyone who reads a public session id from hijacking its
 * push notifications or leaderboard stats.
 */
export function claimSession(): Promise<boolean> {
  const sessionId = getSessionId();
  if (claimedSessionId !== sessionId) {
    claimPromise = null;
    claimedSessionId = sessionId;
  }
  if (!claimPromise) {
    const attempt = (async () => {
      try {
        const deviceId = await initDeviceId();
        const { data, error } = await supabase.rpc('claim_session', {
          p_session_id: sessionId,
          p_device_id: deviceId,
        });
        if (error) return false;
        return !!data;
      } catch {
        return false;
      }
    })();
    claimPromise = attempt;
    // Share pending/successful claims, but allow the next action to retry
    // after offline startup or a refused/failed registration.
    void attempt.then((ok) => {
      if (!ok && claimPromise === attempt) claimPromise = null;
    });
  }
  return claimPromise;
}

/** Never dispatch an online action without a confirmed device binding. */
export async function requireClaimedDevice(): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ok = await Promise.race([
      claimSession(),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 5_000); }),
    ]);
    if (!ok) throw new Error('session not ready');
    return await initDeviceId();
  } finally {
    clearTimeout(timer);
  }
}


// Kept as a thin wrapper for backwards compatibility.
// Profile data now lives in src/lib/profile.ts (local-only, no auth).
export function getPlayerName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) || '';
}

export function setPlayerName(name: string): void {
  localStorage.setItem(PLAYER_NAME_KEY, name.trim());
}

/** Reserve a globally unique player name (case-insensitive) on the server. */
export async function reservePlayerName(name: string): Promise<'ok' | 'taken' | 'error'> {
  try {
    const deviceId = await initDeviceId();
    const { data, error } = await supabase.rpc('reserve_player_name', {
      p_session_id: getSessionId(), p_device_id: deviceId, p_name: name,
    });
    if (error) return 'error';
    return data === 'ok' ? 'ok' : data === 'taken' ? 'taken' : 'error';
  } catch {
    return 'error';
  }
}

/** Stable 4-digit number per session, used as "Spelare 4832" when no name is set. */
export function getAnonNumber(): number {
  const id = getSessionId();
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 1000 + (h % 9000);
}
