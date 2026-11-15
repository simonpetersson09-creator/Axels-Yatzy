import { acknowledgeResultReport, getPendingResultReports, getRankedGames } from './local-stats';
import { reportLocalYatzyMatch } from './gold-dice';
import { reportWeeklyScore } from './hall-of-fame';
import { syncCountryRank } from './country-rank';
import { trackFinishedEvent } from './finished-event';

let pending: Promise<void> | null = null;
/** Stats and this outbox commit together; only confirmed delivery removes work. */
export function flushResultReports(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    for (const report of getPendingResultReports()) {
      const weekly = await reportWeeklyScore(report.score, report.key, report.completedAt);
      const yatzy = !report.yatzy || await reportLocalYatzyMatch(report.key);
      // The cumulative country total can safely be resynced from Home; never
      // replay an older total over a later completed match.
      void syncCountryRank(getRankedGames());
      trackFinishedEvent(report.key, { score: report.score }, { gameMode: report.key.startsWith('mp:') ? 'multiplayer' : 'single_player' });
      if (weekly && yatzy) acknowledgeResultReport(report.key);
    }
  })().catch(() => {}).finally(() => { pending = null; });
  return pending;
}