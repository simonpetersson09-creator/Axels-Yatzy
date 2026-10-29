export interface AdminDayRow {
  day: string;
  devices: number;
  ios: number;
  android: number;
  played: number;
  total: number;
  cpu_finished: number;
  online_finished: number;
  forfeits: number;
  issues: number;
}

export type AdminColumnKey = keyof AdminDayRow;

/** The number a column actually shows for a day. */
export function adminCellValue(row: AdminDayRow, key: AdminColumnKey): number {
  if (key === "total") return Number(row.cpu_finished ?? 0) + Number(row.online_finished ?? 0);
  if (key === "ios") return Number(row.ios ?? 0);
  if (key === "android") return Number(row.android ?? 0);
  return Number(row[key] ?? 0);
}

/**
 * Row index holding the column record (highest number) for each column.
 * Rows arrive newest day first, so ties go to the most recent day.
 * Columns with nothing but zero have no record and return -1.
 */
export function adminRecordIndexes(rows: AdminDayRow[], keys: AdminColumnKey[]): Partial<Record<AdminColumnKey, number>> {
  const out: Partial<Record<AdminColumnKey, number>> = {};
  for (const key of keys) {
    let best = -1;
    let bestValue = 0;
    rows.forEach((row, index) => {
      const value = adminCellValue(row, key);
      if (value > bestValue) {
        bestValue = value;
        best = index;
      }
    });
    out[key] = best;
  }
  return out;
}
