import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { supabase } from '@/integrations/supabase/client';
import { initDeviceId } from '@/lib/device';
import { getSessionId, claimSession } from '@/lib/session';
import { pauseRecoverableWrites, resumeRecoverableWrites } from './recoverable-storage';

const CLEANUP_PENDING = 'mrb_data_deletion_cleanup';
let cleanupPending = false;
function hasCleanupMarker(): boolean {
  if (cleanupPending) return true;
  for (const storage of [localStorage, sessionStorage]) {
    try { if (storage.getItem(CLEANUP_PENDING) === '1') return true; } catch { /* unavailable */ }
  }
  return false;
}
export function isPlayerStorageKey(key: string): boolean {
  return /^(yatzy[_:-]|mrbyatzy_|mrb_)/.test(key);
}

/** Keep SDK consent and unrelated preview/auth storage untouched. */
export async function deletePlayerData(): Promise<void> {
  if (!hasCleanupMarker()) {
    if (!await claimSession()) throw new Error('ownership');
    const { data, error } = await supabase.rpc('delete_player_data', {
      p_session_id: getSessionId(), p_device_id: await initDeviceId(),
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data) || data.ok !== true) {
      throw new Error('delete_failed');
    }
    pauseRecoverableWrites();
    cleanupPending = true;
    // Failure to persist the marker must not prevent available cleanup.
    for (const storage of [localStorage, sessionStorage]) {
      try { storage.setItem(CLEANUP_PENDING, '1'); } catch { /* in-memory retry remains */ }
    }
  }
  pauseRecoverableWrites();
  if (Capacitor.isNativePlatform()) await Preferences.remove({ key: 'yatzy_device_id' });
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (isPlayerStorageKey(key) && key !== CLEANUP_PENDING) storage.removeItem(key);
    }
  }
  for (const storage of [localStorage, sessionStorage]) storage.removeItem(CLEANUP_PENDING);
  cleanupPending = false;
  resumeRecoverableWrites();
}