import { describe, expect, it } from "vitest";
import { adminCellValue, adminRecordIndexes, type AdminDayRow } from "./admin-records";

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
