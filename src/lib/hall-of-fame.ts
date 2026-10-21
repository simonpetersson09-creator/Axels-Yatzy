import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { initDeviceId } from '@/lib/device';
import { getSessionId } from '@/lib/session';
import { getProfileName, getProfileCountry } from '@/lib/profile';
import { t } from '@/lib/i18n';

export interface HallOfFameEntry {
  session_id: string;
  name: string;
  country: string | null;
  best_score: number;
  games_played: number;
}

export const HOF_SIZE = 10;
const RANK_CACHE_KEY = 'yatzy_hof_rank_v1';
const RANK_EVENT = 'hof:rank';
const MOST_GAMES_CACHE_KEY = 'yatzy_hof_games_rank_v1';

/** Last known Hall of Fame rank this week (null = not in the list). */
export function getCachedHofRank(): number | null {
  try {
    const raw = localStorage.getItem(RANK_CACHE_KEY);
    if (!raw) return null;
    const { rank, week } = JSON.parse(raw) as { rank: number | null; week: string };
    return week === weekKey() && rank && rank <= HOF_SIZE ? rank : null;
  } catch {
    return null;
  }
}

function weekKey(): string {
  // Match the server's Monday boundary in Stockholm, regardless of device timezone.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function cacheRank(rank: number | null) {
  try { localStorage.setItem(RANK_CACHE_KEY, JSON.stringify({ rank, week: weekKey() })); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(RANK_EVENT, { detail: { rank } }));
}

export function subscribeHofRank(cb: (rank: number | null) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<{ rank: number | null }>).detail.rank);
  window.addEventListener(RANK_EVENT, h);
  return () => window.removeEventListener(RANK_EVENT, h);
}

const inTop = (r: number | null | undefined): r is number => !!r && r <= HOF_SIZE;

function cachedMostGamesRank(): number | null {
  try {
    const value = JSON.parse(localStorage.getItem(MOST_GAMES_CACHE_KEY) || 'null');
    return value?.week === weekKey() && inTop(value.rank) ? value.rank : null;
  } catch { return null; }
}

function cacheMostGamesRank(rank: number | null) {
  try { localStorage.setItem(MOST_GAMES_CACHE_KEY, JSON.stringify({ rank, week: weekKey() })); } catch { /* ignore */ }
}

// Undefined means the request failed, not that the player is outside the top 10.
async function readMostGamesRank(): Promise<number | null | undefined> {
  try {
    const { data, error } = await supabase.rpc('get_weekly_most_games', { p_limit: HOF_SIZE });
    if (error || !Array.isArray(data)) return undefined;
    const index = data.findIndex((entry: HallOfFameEntry) => entry.session_id === getSessionId());
    return index < 0 ? null : index + 1;
  } catch { return undefined; }
}

function celebrateRank(before: number | null, after: number | null, mostGames = false, delay = 2500): boolean {
  if (after === null) return false;
  const msg = before === null
    ? t('hofEntered', { rank: after })
    : after < before ? t('hofClimbed', { rank: after }) : null;
  if (!msg) return false;
  setTimeout(() => {
    toast(`🏆 ${mostGames ? `${t('hofGamesTitle')}: ` : ''}${msg}`, {
      duration: 6000,
      action: {
        label: t('hofShow'),
        onClick: () => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/stats' } })),
      },
    });
  }, delay);
  return true;
}

async function syncMostGamesRank(): Promise<void> {
  const before = cachedMostGamesRank();
  const rank = await readMostGamesRank();
  if (rank === undefined) return;
  cacheMostGamesRank(rank);
  if (before !== null && (rank === null || rank > before)) {
    window.dispatchEvent(new CustomEvent('hof:dropped', { detail: { rank, mostGames: true } }));
  } else {
    celebrateRank(before, rank, true);
  }
}

/** Reports a finished match to this week's Hall of Fame and celebrates entering/climbing the top 10. */
export async function reportWeeklyScore(score: number): Promise<void> {
  try {
    const gamesBefore = await readMostGamesRank();
    const deviceId = await initDeviceId();
    const { data, error } = await supabase.rpc('report_weekly_score_ranked', {
      p_session_id: getSessionId(),
      p_device_id: deviceId,
      p_name: getProfileName() || '',
      p_score: Math.round(score),
      p_country: getProfileCountry() ?? undefined,
    });
    if (error || !data) return;
    const res = data as { ok?: boolean; before?: number | null; after?: number | null };
    if (!res.ok) return;
    const after = inTop(res.after) ? res.after : null;
    cacheRank(after);
    const before = inTop(res.before) ? res.before : null;
    const scoreNotice = celebrateRank(before, after);
    const gamesAfter = await readMostGamesRank();
    if (gamesAfter !== undefined) {
      cacheMostGamesRank(gamesAfter);
      if (gamesBefore !== undefined) {
        celebrateRank(gamesBefore, gamesAfter, true, scoreNotice ? 9000 : 2500);
      }
    }
  } catch { /* best effort */ }
}

/** Refreshes my current rank (others may have passed me) and tells me if I dropped. */
export async function syncMyHofRank(): Promise<number | null> {
  void syncMostGamesRank();
  try {
    const before = getCachedHofRank();
    const { data, error } = await supabase.rpc('get_my_hof_rank', { p_session_id: getSessionId() });
    if (error) return getCachedHofRank();
    const rank = inTop(data as number | null) ? (data as number) : null;
    cacheRank(rank);
    if (before !== null && (rank === null || rank > before)) {
      window.dispatchEvent(new CustomEvent('hof:dropped', { detail: { rank } }));
    }
    return rank;
  } catch {
    return getCachedHofRank();
  }
}

export async function fetchWeeklyHallOfFame(limit = HOF_SIZE): Promise<HallOfFameEntry[]> {
  try {
    const { data, error } = await supabase.rpc('get_weekly_hall_of_fame', { p_limit: limit });
    if (error || !Array.isArray(data)) return [];
    return data as unknown as HallOfFameEntry[];
  } catch {
    return [];
  }
}

export async function fetchWeeklyMostGames(limit = HOF_SIZE): Promise<HallOfFameEntry[]> {
  try {
    const { data, error } = await supabase.rpc('get_weekly_most_games', { p_limit: limit });
    if (error || !Array.isArray(data)) return [];
    return data as unknown as HallOfFameEntry[];
  } catch {
    return [];
  }
}
