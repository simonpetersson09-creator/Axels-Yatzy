// Gold dice: referral reward (inviter gets 10 days per new friend who downloads
// the app and joins their game). Server decides; client caches gold_until.
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';

const KEY = 'mrbyatzy_gold_until_v1';
const listeners = new Set<() => void>();

export function getGoldUntil(): number {
  try { return parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch { return 0; }
}

export function isGoldDiceActive(): boolean {
  return getGoldUntil() > Date.now();
}

export function goldDaysLeft(): number {
  return Math.max(0, Math.ceil((getGoldUntil() - Date.now()) / 86400000));
}

export function subscribeGoldDice(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Fetches the reward from the server. Returns true when new gold days were earned. */
export async function refreshGoldDice(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('get_gold_dice', { p_session_id: getSessionId() });
    if (error) return false;
    const until = (data as { gold_until?: string | null } | null)?.gold_until;
    const next = until ? Date.parse(until) : 0;
    const prev = getGoldUntil();
    if (next === prev) return false;
    localStorage.setItem(KEY, String(next));
    listeners.forEach(l => l());
    return next > prev && next > Date.now();
  } catch {
    return false;
  }
}
