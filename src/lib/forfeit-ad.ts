// Forfeit ad (computer matches only): shown on the results exit, never mid-game.
// Forfeits still affect no statistics; this only decides ad eligibility.
export const FORFEIT_AD_MIN_SCORE = 30;
export const FORFEIT_AD_MIN_COMPLETED_GAMES = 5;
export const FORFEIT_AD_INTERVAL_MS = 10 * 60_000;
export const FORFEIT_AD_RECENT_AD_MS = 3 * 60_000;
const KEY = 'yatzy-forfeit-ad-at';

export function forfeitAdAllowed(o: {
  score: number; vsComputer: boolean; completedGames: number;
  now: number; lastForfeitAdAt: number; lastAdShownAt: number;
}): boolean {
  if (!o.vsComputer) return false;
  if (o.score < FORFEIT_AD_MIN_SCORE) return false;
  if (o.completedGames < FORFEIT_AD_MIN_COMPLETED_GAMES) return false;
  if (o.lastForfeitAdAt && o.now - o.lastForfeitAdAt < FORFEIT_AD_INTERVAL_MS) return false;
  if (o.lastAdShownAt && o.now - o.lastAdShownAt < FORFEIT_AD_RECENT_AD_MS) return false;
  return true;
}

export function getLastForfeitAdAt(): number {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}
export function markForfeitAd(now = Date.now()): void {
  try { localStorage.setItem(KEY, String(now)); } catch { /* best effort */ }
}
