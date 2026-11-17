import bufferEq from "buffer-equal-constant-time";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

describe("vendored buffer-equal-constant-time", () => {
  it.each([
    { a: Buffer.from("ab"), b: Buffer.from("ab"), expected: true },
    { a: Buffer.alloc(0), b: Buffer.alloc(0), expected: true },
    { a: Buffer.from("ab"), b: Buffer.from("ac"), expected: false },
    { a: Buffer.from("a"), b: Buffer.from("ab"), expected: false },
    { a: "ab", b: "ab", expected: false },
    { a: new Uint8Array([1]), b: Buffer.from([1]), expected: false },
  ])("compares $a with $b as $expected", ({ a, b, expected }) => {
    const result = bufferEq(a as Buffer, b as Buffer);

    expect(result).toBe(expected);
  });

  it("lets jsonwebtoken sign and verify HMAC tokens", () => {
    const token = jwt.sign({ user: "u1" }, "secret");

    const payload = jwt.verify(token, "secret");

    expect(payload).toMatchObject({ user: "u1" });
    expect(() => jwt.verify(token, "other")).toThrow("invalid signature");
  });
});
