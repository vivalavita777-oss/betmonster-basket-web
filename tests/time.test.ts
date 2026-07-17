import { describe, expect, it } from "vitest";

import { addDaysIso, appTodayIso, formatMatchDate, formatMatchTime } from "@/lib/time";

describe("app timezone utilities", () => {
  it("calculates today in the app timezone", () => {
    expect(appTodayIso(new Date("2026-07-18T02:30:00Z"))).toBe("2026-07-17");
  });

  it("adds days without UTC date slicing drift", () => {
    expect(addDaysIso("2026-07-17", 1)).toBe("2026-07-18");
    expect(addDaysIso("2026-07-17", -1)).toBe("2026-07-16");
  });

  it("formats match date and time", () => {
    expect(formatMatchDate("2026-07-18T18:30:00-04:00")).toContain("Jul");
    expect(formatMatchTime("2026-07-18T18:30:00-04:00")).toContain("06");
  });
});
