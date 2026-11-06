export const ADMIN_START_DAY = "2026-11-01";

export function adminVisibleDays<T extends { day: string }>(days: T[]): T[] {
  return days.filter((row) => row.day >= ADMIN_START_DAY);
}