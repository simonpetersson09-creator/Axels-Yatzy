/**
 * Soft notification prompt rules:
 * - First shown after the player's first finished match.
 * - "Inte nu" re-asks after 3 more finished matches, at most 3 times in total.
 * - Never shown when iOS permission is already granted or denied.
 */
const ASKED_AT_KEY = 'mrbyatzy_notif_ask_at_games';
const COUNT_KEY = 'mrbyatzy_notif_ask_count';
const SNOOZE_STEP = 3;
const MAX_ASKS = 3;

export function shouldAskForNotifications(gamesPlayed: number): boolean {
  try {
    const count = parseInt(localStorage.getItem(COUNT_KEY) || '0', 10) || 0;
    if (count >= MAX_ASKS) return false;
    const asked = parseInt(localStorage.getItem(ASKED_AT_KEY) || '0', 10) || 0;
    if (asked === 0) return gamesPlayed >= 1;
    return gamesPlayed >= asked + SNOOZE_STEP;
  } catch {
    return false;
  }
}

export function markNotificationsAsked(gamesPlayed: number, done: boolean): void {
  try {
    localStorage.setItem(ASKED_AT_KEY, String(gamesPlayed));
    const count = parseInt(localStorage.getItem(COUNT_KEY) || '0', 10) || 0;
    localStorage.setItem(COUNT_KEY, String(done ? MAX_ASKS : count + 1));
  } catch { /* noop */ }
}
