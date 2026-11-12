import { describe, expect, it } from "vitest";
import { adminHourLabel, adminWeekdayName } from "./admin-best-times";

describe("adminWeekdayName", () => {
  it("maps ISO weekdays 1–7 to Swedish names", () => {
    expect(adminWeekdayName(1)).toBe("måndag");
    expect(adminWeekdayName(5)).toBe("fredag");
    expect(adminWeekdayName(7)).toBe("söndag");
  });

  it("returns null for invalid values", () => {
    expect(adminWeekdayName(0)).toBeNull();
    expect(adminWeekdayName(8)).toBeNull();
    expect(adminWeekdayName(null)).toBeNull();
  });
});

describe("adminHourLabel", () => {
  it("labels the hour as a one-hour interval", () => {
    expect(adminHourLabel(0)).toBe("0–1");
    expect(adminHourLabel(18)).toBe("18–19");
    expect(adminHourLabel(23)).toBe("23–0");
  });

  it("returns null for invalid values", () => {
    expect(adminHourLabel(-1)).toBeNull();
    expect(adminHourLabel(24)).toBeNull();
    expect(adminHourLabel(null)).toBeNull();
  });
});
