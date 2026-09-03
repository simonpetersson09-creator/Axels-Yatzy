/**
 * In-app rating prompt.
 *
 * Rules:
 * - Prompt is shown once, after the player has finished 5 matches.
 * - "Senare" postpones: it re-asks after 5 more finished matches.
 * - Rating itself uses Apple's native in-app review sheet (no app switch).
 */

import { Capacitor } from '@capacitor/core';

const ASKED_AT_KEY = 'mrbyatzy_rate_asked_at_games';
const DONE_KEY = 'mrbyatzy_rate_done';

/** Number of finished matches required before the first prompt. */
export const RATE_PROMPT_THRESHOLD = 5;
/** Extra matches required after the user postponed. */
const SNOOZE_STEP = 5;

export function shouldShowRatePrompt(gamesPlayed: number): boolean {
  try {
    if (localStorage.getItem(DONE_KEY) === '1') return false;
    const asked = parseInt(localStorage.getItem(ASKED_AT_KEY) || '0', 10) || 0;
    if (asked === 0) return gamesPlayed >= RATE_PROMPT_THRESHOLD;
    return gamesPlayed >= asked + SNOOZE_STEP;
  } catch {
    return false;
  }
}

/** Remember that we asked at this match count (user chose "later"). */
export function snoozeRatePrompt(gamesPlayed: number): void {
  try { localStorage.setItem(ASKED_AT_KEY, String(gamesPlayed)); } catch { /* noop */ }
}

/** Never ask again (user rated or declined permanently). */
export function completeRatePrompt(): void {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* noop */ }
}

/** Opens the native review sheet. Returns false when not available (web). */
export async function requestAppReview(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
    return true;
  } catch {
    return false;
  }
}
