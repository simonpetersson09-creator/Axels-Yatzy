/**
 * Gold dice reward: unlocked after finishing friend matches (invite/code
 * lobbies, never quick match or bots) against GOLD_FRIENDS_NEEDED different
 * friends. Progress is derived from server-recorded friend matches.
 */
import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';

export const GOLD_FRIENDS_NEEDED = 3;
export type DiceSkin = 'classic' | 'gold';

const UNLOCK_KEY = 'mrbyatzy_gold_dice_unlocked';
const SKIN_KEY = 'mrbyatzy_dice_skin';
const EVENT = 'dice-skin-changed';

export function isGoldUnlocked(): boolean {
  try { return localStorage.getItem(UNLOCK_KEY) === '1'; } catch { return false; }
}

export function getDiceSkin(): DiceSkin {
  try {
    return isGoldUnlocked() && localStorage.getItem(SKIN_KEY) !== 'classic' ? 'gold' : 'classic';
  } catch { return 'classic'; }
}

export function setDiceSkin(skin: DiceSkin): void {
  try { localStorage.setItem(SKIN_KEY, skin); } catch { /* noop */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useDiceSkin(): DiceSkin {
  return useSyncExternalStore(subscribe, getDiceSkin, () => 'classic');
}

/** Number of different friends with a finished friend match. */
export async function countFriendsPlayed(): Promise<number> {
  const me = getSessionId();
  if (!me) return 0;
  const { data, error } = await supabase
    .from('friend_match_results')
    .select('player_1_id, player_2_id')
    .eq('status', 'finished')
    .or(`player_1_id.eq.${me},player_2_id.eq.${me}`)
    .limit(500);
  if (error || !data) return 0;
  const others = new Set<string>();
  for (const r of data) {
    const other = r.player_1_id === me ? r.player_2_id : r.player_1_id;
    if (other && other !== me && !other.startsWith('bot:')) others.add(other);
  }
  return others.size;
}

/** Refreshes progress; returns { count, newlyUnlocked }. Never throws. */
export async function refreshGoldProgress(): Promise<{ count: number; newlyUnlocked: boolean }> {
  try {
    const count = await countFriendsPlayed();
    if (count >= GOLD_FRIENDS_NEEDED && !isGoldUnlocked()) {
      localStorage.setItem(UNLOCK_KEY, '1');
      localStorage.removeItem(SKIN_KEY); // default to gold right after unlocking
      window.dispatchEvent(new Event(EVENT));
      return { count, newlyUnlocked: true };
    }
    return { count, newlyUnlocked: false };
  } catch {
    return { count: 0, newlyUnlocked: false };
  }
}
