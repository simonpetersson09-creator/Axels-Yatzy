import type { HallOfFameEntry } from './hall-of-fame';
import type { RankInfo, WeeklyRank, TopCountry } from './country-rank';

export interface StatsViewSnapshot {
  rank: RankInfo;
  weekly: WeeklyRank | null;
  top: TopCountry[];
  topMonth: TopCountry[];
  yearGames: number | null;
  hof: HallOfFameEntry[];
  most: HallOfFameEntry[];
  frames: Record<string, string>;
}

// Memory only: no new player data survives an app restart or data deletion.
let cached: { key: string; value: StatsViewSnapshot } | undefined;
function cacheKey(session: string, now: Date) {
  return `${session}:${new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)}`;
}
export function readStatsView(session: string, now = new Date()) {
  return cached?.key === cacheKey(session, now) ? cached.value : undefined;
}
export function saveStatsView(session: string, value: StatsViewSnapshot, now = new Date()) {
  cached = { key: cacheKey(session, now), value };
}