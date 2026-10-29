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

/** A record star measured on screen, in the scroll wrapper's content coords. */
export type StarPoint = {
  key: AdminColumnKey;
  day: string;
  x: number;
  y: number;
  /** y of the empty padding band just inside this star's row top border. */
  lane: number;
};

/**
 * Ribbon between record stars, oldest day first. Every vertical run stays inside
 * the star slot of its column (the only strip of a row that holds no digits) and
 * every horizontal run stays in the padding band between two rows, so the line
 * can never cover a number. Runs are strictly axis aligned and each turn is a
 * quarter-circle fillet, so the ribbon reads as one sweep instead of a zigzag.
 */
export function buildRibbon(pts: StarPoint[]): string {
  if (pts.length < 2) return "";
  const f = (n: number) => n.toFixed(1);
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const lane = a.lane;
    const dx = b.x - a.x;
    const dy1 = lane - a.y;
    const dy2 = b.y - lane;
    const r = Math.max(0, Math.min(14, Math.abs(dy1) / 2, Math.abs(dx) / 2, Math.abs(dy2) / 2));
    if (Math.abs(dx) < 1 || r < 3) {
      d += ` L ${f(a.x)} ${f(lane)} L ${f(b.x)} ${f(lane)} L ${f(b.x)} ${f(b.y)}`;
      continue;
    }
    const sx = Math.sign(dx);
    d +=
      ` L ${f(a.x)} ${f(lane - Math.sign(dy1) * r)}` +
      ` Q ${f(a.x)} ${f(lane)} ${f(a.x + sx * r)} ${f(lane)}` +
      ` L ${f(b.x - sx * r)} ${f(lane)}` +
      ` Q ${f(b.x)} ${f(lane)} ${f(b.x)} ${f(lane + Math.sign(dy2) * r)}` +
      ` L ${f(b.x)} ${f(b.y)}`;
  }
  return d;
}
