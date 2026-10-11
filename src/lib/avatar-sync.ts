// Shares the own profile picture so opponents in online games can see it.
// The server stores it per session (device-verified); games read it via get_game_avatars.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, claimSession } from '@/lib/session';
import { getDeviceIdSync, initDeviceId } from '@/lib/device';
import { getProfileAvatar } from '@/lib/profile';

const SYNCED_KEY = 'yatzy_avatar_synced_v1';

function fingerprint(s: string | null): string {
  if (!s) return 'none';
  let h = 0;
  for (let i = 0; i < s.length; i += 7) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

/** Upload the own avatar if it changed since the last successful upload. */
export async function syncOwnAvatar(): Promise<void> {
  try {
    const img = getProfileAvatar();
    const fp = fingerprint(img);
    if (localStorage.getItem(SYNCED_KEY) === fp) return;
    const device = await initDeviceId().catch(() => getDeviceIdSync());
    if (!device) return;
    await claimSession();
    const { data, error } = await supabase.rpc('set_player_avatar', {
      p_session_id: getSessionId(), p_device_id: device, p_image: img ?? '',
    });
    if (!error && data) localStorage.setItem(SYNCED_KEY, fp);
  } catch { /* cosmetic; ignore */ }
}

/** Profile pictures per player index in an online game. */
export function useGameAvatars(gameId: string | null, refreshKey: unknown = 0): Map<number, string> {
  const [map, setMap] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    if (!gameId) return;
    let alive = true;
    supabase.rpc('get_game_avatars', { p_game_id: gameId }).then(({ data }) => {
      const rows = (data as Array<{ player_index: number; image: string }> | null) ?? [];
      if (alive) setMap(new Map(rows.map((r) => [r.player_index, r.image])));
    }, () => {});
    return () => { alive = false; };
  }, [gameId, refreshKey]);
  return map;
}
