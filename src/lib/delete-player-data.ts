import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { supabase } from '@/integrations/supabase/client';
import { initDeviceId } from '@/lib/device';
import { getSessionId, claimSession } from '@/lib/session';

const CLEANUP_PENDING = 'mrb_data_deletion_cleanup';
export function isPlayerStorageKey(key: string): boolean {
  return /^(yatzy[_:-]|mrbyatzy_|mrb_)/.test(key);
}

/** Keep SDK consent and unrelated preview/auth storage untouched. */
export async function deletePlayerData(): Promise<void> {
  if (localStorage.getItem(CLEANUP_PENDING) !== '1') {
    if (!await claimSession()) throw new Error('ownership');
    const { data, error } = await supabase.rpc('delete_player_data', {
      p_session_id: getSessionId(), p_device_id: await initDeviceId(),
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data) || data.ok !== true) {
      throw new Error('delete_failed');
    }
    localStorage.setItem(CLEANUP_PENDING, '1');
  }
  if (Capacitor.isNativePlatform()) await Preferences.remove({ key: 'yatzy_device_id' });
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (isPlayerStorageKey(key) && key !== CLEANUP_PENDING) storage.removeItem(key);
    }
  }
  localStorage.removeItem(CLEANUP_PENDING);
}