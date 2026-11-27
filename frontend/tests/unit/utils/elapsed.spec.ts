import { formatElapsed } from "src/utils/elapsed";

describe("formatElapsed", () => {
  it("shows minutes and padded seconds under an hour", () => {
    const short = formatElapsed(42_900);
    const long = formatElapsed(754_000);

    expect(short).toBe("0:42");
    expect(long).toBe("12:34");
  });

  it("adds hours from an hour on", () => {
    const value = formatElapsed(3_723_000);

    expect(value).toBe("1:02:03");
  });

  it("clamps negative durations to zero", () => {
    const value = formatElapsed(-5_000);

    expect(value).toBe("0:00");
  });
});
