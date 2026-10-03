const LAST_KEY = 'mrbyatzy_daily_ad_prompt_v1';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Startup ad: shown on every cold start of the app, from the very first launch. */
export function shouldShowDailyStartupAd(): boolean {
  return true;
}

/** Kept for reference/analytics: remembers the last day an ad was shown. */
export function markDailyStartupAdShown() {
  try { localStorage.setItem(LAST_KEY, today()); } catch { /* noop */ }
}
