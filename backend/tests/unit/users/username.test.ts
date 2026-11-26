import { toUsername, usernameCandidates } from "packages/users/username";
import { describe, expect, it } from "vitest";

const USERNAME = /^[a-z0-9-_.]{3,15}$/;

describe("toUsername", () => {
  it.each([
    { source: "Stanislav.Lapshin", expected: "stanislav.lapsh" },
    { source: "José_M-1", expected: "jose_m-1" },
    { source: "a b+c@d", expected: "abcd" },
    { source: "ab", expected: null },
    { source: "Станислав", expected: null },
    { source: undefined, expected: null },
  ])("maps $source to $expected", ({ source, expected }) => {
    const username = toUsername(source);

    expect(username).toBe(expected);
  });
});

describe("usernameCandidates", () => {
  it("starts with the preferred username", () => {
    const candidates = usernameCandidates({
      preferred: "Jane.Doe",
      email: "jdoe@example.com",
    });

    expect(candidates[0]).toBe("jane.doe");
  });

  it("falls back to the email local part when the preferred one is unusable", () => {
    const candidates = usernameCandidates({
      preferred: "Яна",
      email: "Jane.Doe+sso@example.com",
    });

    expect(candidates[0]).toBe("jane.doesso");
  });

  it("falls back to a fixed stem when nothing is usable", () => {
    const candidates = usernameCandidates({ email: "яна@example.com" });

    expect(candidates[0]).toBe("user");
  });

  it("adds valid suffixed alternatives for clashes", () => {
    const candidates = usernameCandidates(
      { preferred: "averyverylongname", email: "x@example.com" },
      5
    );

    expect(candidates).toHaveLength(6);
    expect(candidates[0]).toBe("averyverylongna");
    for (const candidate of candidates.slice(1)) {
      expect(candidate).toMatch(/^averyverylo[0-9a-f]{4}$/);
    }
    for (const candidate of candidates) {
      expect(candidate).toMatch(USERNAME);
    }
  });
});
