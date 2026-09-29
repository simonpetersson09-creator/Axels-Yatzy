const LAST_KEY = 'mrbyatzy_daily_ad_prompt_v1';
const FIRST_SEEN_KEY = 'mrbyatzy_first_launch_day_v1';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Startup ad: max once per calendar day, never on the player's first day. */
export function shouldShowDailyStartupAd(): boolean {
  try {
    const day = today();
    const first = localStorage.getItem(FIRST_SEEN_KEY);
    if (!first) { localStorage.setItem(FIRST_SEEN_KEY, day); return false; }
    if (first === day) return false;
    return localStorage.getItem(LAST_KEY) !== day;
  } catch {
    return false;
  }
}

export function markDailyStartupAdShown() {
  try { localStorage.setItem(LAST_KEY, today()); } catch { /* noop */ }
}
