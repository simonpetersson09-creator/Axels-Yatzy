import { supabase } from '@/integrations/supabase/client';
import { getSessionId, requireClaimedDevice } from '@/lib/session';
import { fetchShop } from '@/lib/dice-shop';

export interface WeeklyReward {
  week_start: string;
  list: 'score' | 'games';
  rank: number;
  xp: number;
}

/** No client-awarded XP: only read the server's durable prize receipts. */
export async function fetchWeeklyRewards(): Promise<WeeklyReward[] | null> {
  try {
    const device = await requireClaimedDevice();
    const { data, error } = await supabase.rpc('get_weekly_xp_rewards', {
      p_session_id: getSessionId(), p_device_id: device,
    });
    const result = data as { ok?: boolean; rewards?: WeeklyReward[] } | null;
    if (error || !result?.ok) return null;
    if (result.rewards?.length) await fetchShop();
    return result.rewards ?? [];
  } catch { return null; }
}

export async function acknowledgeWeeklyRewards(week: string): Promise<boolean> {
  try {
    const device = await requireClaimedDevice();
    const { data, error } = await supabase.rpc('ack_weekly_xp_rewards', {
      p_session_id: getSessionId(), p_device_id: device, p_week_start: week,
    });
    return !error && data === true;
  } catch { return false; }
}