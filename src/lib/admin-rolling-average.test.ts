import { describe, expect, it } from "vitest";
import { adminRollingMean, adminRecordIndexes, type AdminDayRow } from "./admin-records";

const rows: AdminDayRow[] = Array.from({ length: 31 }, (_, index) => ({
  day: new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10),
  devices: index + 1, played: 10, ios: 8, android: 2,
  total: 999, cpu_finished: 3, online_finished: 2, forfeits: 0, issues: 0,
  avg_app_age_days: 1.5,
}));

describe("admin trailing 30 calendar days", () => {
  it("does not turn damaged online history into a mean or a record", () => {
    const damaged = rows.map(r => ({...r, incomplete_columns: r.day === "2026-10-05" ? ["online_finished", "total", "forfeits"] : []}));
    expect(adminRollingMean(damaged,"2026-10-31","online_finished")).toBeNull();
    expect(adminRollingMean(damaged,"2026-10-31","total")).toBeNull();
    expect(adminRecordIndexes(damaged,["online_finished"]).online_finished).toBe(-1);
    expect(adminRollingMean(damaged,"2026-10-31","cpu_finished")).toBe(3);
  });
  it("includes the selected day and excludes days older than 29 days", () => {
    expect(adminRollingMean(rows, "2026-10-31", "devices")).toBe(16.5);
  });
  it("uses the selected historical date, not future rows", () => {
    expect(adminRollingMean(rows, "2026-10-30", "devices")).toBe(15.5);
  });
  it("does not guess a mean when fewer than 30 calendar days exist", () => {
    expect(adminRollingMean(rows, "2026-10-29", "devices")).toBeNull();
  });
  it("includes zero days and uses the displayed match total", () => {
    expect(adminRollingMean(rows, "2026-10-31", "forfeits")).toBe(0);
    expect(adminRollingMean(rows, "2026-10-31", "total")).toBe(5);
  });
  it("averages each platform separately and preserves app-age precision", () => {
    expect(adminRollingMean(rows, "2026-10-31", "ios")).toBe(8);
    expect(adminRollingMean(rows, "2026-10-31", "android")).toBe(2);
    expect(adminRollingMean(rows, "2026-10-31", "avg_app_age_days")).toBe(1.5);
  });
});