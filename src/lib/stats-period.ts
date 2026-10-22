/** Keep visible periods aligned with the server, regardless of phone timezone. */
export function getStatsPeriod(locale: string, now = new Date()): { year: number; monthName: string } {
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Stockholm', year: 'numeric' }).format(now));
  const monthName = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Stockholm', month: 'long' }).format(now);
  return { year, monthName };
}