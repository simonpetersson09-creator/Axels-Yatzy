import { describe, expect, it } from "vitest";
import {
  adminCellValue,
  adminRecordIndexes,
  buildRibbon,
  type AdminColumnKey,
  type AdminDayRow,
  type StarPoint,
} from "./admin-records";

const row = (over: Partial<AdminDayRow>): AdminDayRow => ({
  day: "2026-10-29",
  devices: 10,
  ios: 8,
  android: 2,
  played: 5,
  total: 0,
  cpu_finished: 20,
  online_finished: 3,
  forfeits: 1,
  issues: 0,
  ...over,
});

describe("adminRecordIndexes", () => {
  it("preserves median app age and selects its highest daily value", () => {
    const rows = [row({ median_app_age_days: 3.5 }), row({ median_app_age_days: 10 })];
    expect(adminCellValue(rows[0], "median_app_age_days")).toBe(3.5);
    expect(adminRecordIndexes(rows, ["median_app_age_days"]).median_app_age_days).toBe(1);
  });
  it("preserves fractional app age and records its highest daily mean", () => {
    const rows = [row({ avg_app_age_days: 2.5 }), row({ avg_app_age_days: 12.4 })];
    expect(adminCellValue(rows[0], "avg_app_age_days")).toBe(2.5);
    expect(adminRecordIndexes(rows, ["avg_app_age_days"]).avg_app_age_days).toBe(1);
  });
  it("marks the highest number in each column", () => {
    const rows = [row({ day: "2026-10-29" }), row({ day: "2026-10-28", devices: 85 }), row({ day: "2026-10-27" })];
    const records = adminRecordIndexes(rows, ["devices"]);
    expect(records.devices).toBe(1);
  });

  it("reads the total column as computer plus online matches", () => {
    const rows = [
      row({ cpu_finished: 40, online_finished: 25 }),
      row({ cpu_finished: 60, online_finished: 1 }),
    ];
    expect(adminCellValue(rows[0], "total")).toBe(65);
    expect(adminRecordIndexes(rows, ["total"]).total).toBe(0);
  });

  it("uses the iPhone count for the iPhone / Android column", () => {
    const rows = [
      row({ ios: 34, android: 5 }),
      row({ ios: 65, android: 5 }),
      row({ ios: 38, android: 0 }),
    ];
    expect(adminRecordIndexes(rows, ["ios"]).ios).toBe(1);
  });

  it("gives ties to the most recent day, since newest rows come first", () => {
    const rows = [row({ issues: 7 }), row({ issues: 7 })];
    expect(adminRecordIndexes(rows, ["issues"]).issues).toBe(0);
  });

  it("leaves all-zero columns without a record", () => {
    const rows = [row({ issues: 0 }), row({ issues: 0 })];
    expect(adminRecordIndexes(rows, ["issues"]).issues).toBe(-1);
  });
});

/** A record star measured on screen; lane is the empty band above its row. */
const star = (key: AdminColumnKey, day: string, x: number, y: number): StarPoint => ({
  key,
  day,
  x,
  y,
  lane: y - 14,
});

// Chronological gold stars, incl. a same-day pair and one step that goes left.
const GOLD: StarPoint[] = [
  star("devices", "2026-10-15", 100, 500),
  star("played", "2026-10-16", 300, 470),
  star("ios", "2026-10-17", 200, 440),
  star("total", "2026-10-26", 400, 170),
  star("online_finished", "2026-10-26", 600, 170),
  star("cpu_finished", "2026-10-27", 500, 140),
];

type Run = { axis: "h" | "v"; at: number; from: number; to: number };

/** Walks the ribbon path and throws if any run cuts diagonally across a cell. */
function walk(path: string): { runs: Run[]; corners: { x: number; y: number }[] } {
  const runs: Run[] = [];
  const corners: { x: number; y: number }[] = [];
  let cur = { x: NaN, y: NaN };
  for (const cmd of path.match(/[MLQ][^MLQ]*/g) ?? []) {
    const nums = (cmd.slice(1).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    if (cmd[0] === "M") {
      cur = { x: nums[0], y: nums[1] };
    } else if (cmd[0] === "L") {
      const [x, y] = nums;
      if (y === cur.y) runs.push({ axis: "h", at: y, from: cur.x, to: x });
      else if (x === cur.x) runs.push({ axis: "v", at: x, from: cur.y, to: y });
      else throw new Error(`diagonal run from ${cur.x},${cur.y} to ${x},${y}`);
      cur = { x, y };
    } else {
      const [cx, cy, x, y] = nums;
      const verticalThenHorizontal = cur.x === cx && y === cy;
      const horizontalThenVertical = cur.y === cy && x === cx;
      if (!verticalThenHorizontal && !horizontalThenVertical) {
        throw new Error(`turn from ${cur.x},${cur.y} via ${cx},${cy} to ${x},${y} is not a rounded corner`);
      }
      corners.push({ x: cx, y: cy });
      cur = { x, y };
    }
  }
  return { runs, corners };
}

describe("buildRibbon", () => {
  it("never crosses a number: horizontal runs sit in a row band, vertical runs in a star slot", () => {
    const lanes = new Set(GOLD.map((p) => p.lane));
    const slots = new Set(GOLD.map((p) => p.x));
    const { runs, corners } = walk(buildRibbon(GOLD));
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      if (run.axis === "h") expect(lanes.has(run.at)).toBe(true);
      else expect(slots.has(run.at)).toBe(true);
    }
    for (const corner of corners) {
      expect(slots.has(corner.x)).toBe(true);
      expect(lanes.has(corner.y)).toBe(true);
    }
  });

  it("never cuts diagonally between stars", () => {
    expect(() => walk(buildRibbon(GOLD))).not.toThrow();
  });

  it("rounds every turn so the ribbon reads as a sweep, not a zigzag", () => {
    const path = buildRibbon(GOLD);
    const turns = (path.match(/Q/g) ?? []).length;
    expect(turns).toBe(10);
    expect(path.match(/Q/g)).not.toBeNull();
  });

  it("touches every star and runs oldest day first to newest last", () => {
    const path = buildRibbon(GOLD);
    const { runs } = walk(path);
    for (const p of GOLD) {
      const onRibbon = runs.some(
        (r) =>
          r.axis === "v" &&
          r.at === p.x &&
          Math.min(r.from, r.to) <= p.y &&
          p.y <= Math.max(r.from, r.to),
      );
      expect(onRibbon, `star ${p.key} on ${p.day}`).toBe(true);
    }
    expect(path.startsWith(`M ${GOLD[0].x.toFixed(1)} ${GOLD[0].y.toFixed(1)}`)).toBe(true);
    const last = GOLD[GOLD.length - 1];
    const tail = runs[runs.length - 1];
    expect(tail.to).toBeCloseTo(last.y, 1);
  });

  it("draws nothing for a single star", () => {
    expect(buildRibbon([GOLD[0]])).toBe("");
    expect(buildRibbon([])).toBe("");
  });
});
