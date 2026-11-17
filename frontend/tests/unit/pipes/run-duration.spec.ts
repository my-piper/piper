import { fillDays } from "src/app/project-stats/project-stats.component";
import { DailyRuns } from "src/models/project-stats";
import { formatRunDuration } from "src/pipes/run-duration";

describe("formatRunDuration", () => {
  it("formats durations compactly", () => {
    const cases: [number | null, string][] = [
      [null, "—"],
      [NaN, "—"],
      [0, "0ms"],
      [350, "350ms"],
      [4240, "4.2s"],
      [42400, "42s"],
      [185000, "3m 05s"],
      [4800000, "1h 20m"],
    ];

    const formatted = cases.map(([ms]) => formatRunDuration(ms));

    expect(formatted).toEqual(cases.map(([, text]) => text));
  });
});

describe("fillDays", () => {
  it("keeps known days and fills the gaps up to today", () => {
    const known = new DailyRuns({ day: "2026-11-08", succeeded: 2 });

    const days = fillDays([known], 3, new Date(2026, 10, 9, 12));

    expect(days.map((d) => d.day)).toEqual([
      "2026-11-07",
      "2026-11-08",
      "2026-11-09",
    ]);
    expect(days[1]).toBe(known);
    expect(days[0].runs).toBe(0);
  });
});
