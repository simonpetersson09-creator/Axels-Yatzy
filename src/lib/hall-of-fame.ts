import { supabase } from '@/integrations/supabase/client';
import { initDeviceId } from '@/lib/device';
import { getSessionId } from '@/lib/session';
import { getProfileName, getProfileCountry } from '@/lib/profile';

export interface HallOfFameEntry {
  session_id: string;
  name: string;
  country: string | null;
  best_score: number;
  games_played: number;
}

/** Reports a finished match to this week's Hall of Fame (server keeps the best score). */
export async function reportWeeklyScore(score: number): Promise<void> {
  try {
    const deviceId = await initDeviceId();
    await supabase.rpc('report_weekly_score', {
      p_session_id: getSessionId(),
      p_device_id: deviceId,
      p_name: getProfileName() || '',
      p_score: Math.round(score),
      p_country: getProfileCountry() ?? undefined,
    });
  } catch { /* best effort */ }
}

export async function fetchWeeklyHallOfFame(limit = 10): Promise<HallOfFameEntry[]> {
  try {
    const { data, error } = await supabase.rpc('get_weekly_hall_of_fame', { p_limit: limit });
    if (error || !Array.isArray(data)) return [];
    return data as unknown as HallOfFameEntry[];
  } catch {
    return [];
  }
}
