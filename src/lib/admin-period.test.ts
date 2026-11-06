import { describe, expect, it } from "vitest";
import { adminVisibleDays } from "./admin-period";

describe("admin period", () => {
  it("excludes everything before November 1, 2026 and retains November 1 onwards", () => {
    expect(adminVisibleDays([
      { day: "2026-10-31", devices: 9 },
      { day: "2026-11-01", devices: 4 },
      { day: "2026-11-06", devices: 7 },
    ])).toEqual([
      { day: "2026-11-01", devices: 4 },
      { day: "2026-11-06", devices: 7 },
    ]);
  });
});