// Timing diagnostics: Snabbspel wait and push tap → game shown.
// Only durations and coarse kinds are logged — no names or content.
import { trackEvent } from '@/lib/analytics';

/** Max credible duration; longer values (e.g. clock changes) are capped. */
const MAX_MS = 30 * 60 * 1000;

export function searchWaitMs(startedAt: number | undefined, now = Date.now()): number | null {
  if (!startedAt) return null;
  return Math.max(0, Math.min(MAX_MS, now - startedAt));
}

type PendingTap = { gameId: string; at: number; kind: string };
let pendingTap: PendingTap | null = null;
/** A tap only counts toward "game shown" if the game appears within this time. */
const TAP_EXPIRY_MS = 2 * 60 * 1000;

/** Called when a push tap navigates. Logs tap → navigation, remembers the game. */
export function reportPushTapNavigated(kind: string, tappedAt: number, gameId: string | undefined, now = Date.now()) {
  trackEvent('push_tap_navigated', { kind, ms: searchWaitMs(tappedAt, now), has_game: !!gameId });
  pendingTap = gameId ? { gameId, at: tappedAt, kind } : null;
}

/** Called when an online game has its state on screen. Logs tap → game shown once. */
export function reportPushTapGameShown(gameId: string | null, now = Date.now()) {
  const tap = pendingTap;
  if (!tap || !gameId) return;
  if (now - tap.at > TAP_EXPIRY_MS) { pendingTap = null; return; }
  if (tap.gameId !== gameId) return;
  pendingTap = null;
  trackEvent('push_tap_game_shown', { kind: tap.kind, ms: searchWaitMs(tap.at, now) });
}

export function __resetPlayTimingForTests() { pendingTap = null; }
