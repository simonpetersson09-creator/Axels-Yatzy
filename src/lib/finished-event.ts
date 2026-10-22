import { trackEvent } from './analytics';

/** A separate ledger also covers forfeits, which must never touch player stats. */
export function trackFinishedEvent(matchKey: string, metadata: Record<string, unknown>, options: { gameId?: string; gameMode: string }): boolean {
  const key = `yatzy-finished-event:${matchKey}`;
  try {
    if (localStorage.getItem(key) === '1') return false;
    localStorage.setItem(key, '1');
  } catch { return false; }
  trackEvent('game_finished', metadata, options);
  return true;
}