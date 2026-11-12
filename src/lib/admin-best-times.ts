// Bästa veckodag och timme för admin, oberoende av varandra.
// Underlaget kommer från serverfunktionen admin_best_times (svensk tid, bara appenheter).

export interface AdminBestTimes {
  weekday: { dow: number; avg_devices: number; days: number } | null;
  hour: { hour: number; devices: number } | null;
}

const WEEKDAYS_SV = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];

/** ISO-veckodag 1–7 (måndag–söndag) → svenskt namn; null vid ogiltigt värde. */
export function adminWeekdayName(dow: number | null | undefined): string | null {
  if (dow == null || dow < 1 || dow > 7) return null;
  return WEEKDAYS_SV[dow - 1];
}

/** Timme 0–23 → intervalltext, t.ex. 18 → "18–19"; null vid ogiltigt värde. */
export function adminHourLabel(hour: number | null | undefined): string | null {
  if (hour == null || hour < 0 || hour > 23) return null;
  return `${hour}–${(hour + 1) % 24}`;
}
