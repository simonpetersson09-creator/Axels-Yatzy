import { trackEvent } from './analytics';

/** A separate ledger also covers forfeits, which must never touch player stats. */
export function trackFinishedEvent(matchKey: string, metadata: Record<string, unknown>, options: { gameId?: string; gameMode: string }): boolean {
  const key = `yatzy-finished-event:${matchKey}`;
  try {
    if (localStorage.getItem(key) === '1') return false;
  } catch { return false; }
  // Stable event ID makes the queue-first / ledger-second interruption safe:
  // reprocessing the result can only deliver the same event, never a new one.
  trackEvent('game_finished', { ...metadata, event_id: `finished:${matchKey}` }, options);
  try { localStorage.setItem(key, '1'); } catch { return false; }
  return true;
}