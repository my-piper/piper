import { fromRedisValue, toRedisValue } from "utils/redis";
import { describe, expect, it } from "vitest";

describe("Redis value contracts", () => {
  it.each([
    { type: "boolean", value: false, encoded: "" },
    { type: "boolean", value: true, encoded: "1" },
    { type: "integer", value: 0, encoded: "0" },
    { type: "integer", value: -42, encoded: "-42" },
    { type: "float", value: 0, encoded: "0" },
    { type: "float", value: -1.25, encoded: "-1.25" },
    { type: "string", value: "", encoded: "" },
    { type: "string", value: "Привет 🌍", encoded: "Привет 🌍" },
    { type: "string", value: "null", encoded: "null" },
    {
      type: "json",
      value: '{"items":[false,0,""]}',
      encoded: '{"items":[false,0,""]}',
    },
    { type: "json", value: "null", encoded: "null" },
    { type: "string[]", value: "first|second", encoded: "first|second" },
    {
      type: "image[]",
      value: "first.png|second.png",
      encoded: "first.png|second.png",
    },
    ...["image", "archive", "audio", "video"].map((type) => ({
      type,
      value: "https://example.com/asset",
      encoded: "https://example.com/asset",
    })),
  ])("round trips $type value $value", ({ type, value, encoded }) => {
    const serialized = toRedisValue(type, value);
    const restored = fromRedisValue(type, serialized);

    expect(serialized).toBe(encoded);
    expect(restored).toBe(value);
  });

  it.each([
    "boolean",
    "integer",
    "float",
    "string",
    "json",
    "string[]",
    "image",
    "image[]",
    "archive",
    "audio",
    "video",
  ])(
    "preserves explicit null for %s separately from empty or missing data",
    (type) => {
      const serialized = toRedisValue(type, null);

      expect(serialized).toBe("<!null!>");
      expect(fromRedisValue(type, serialized)).toBeNull();
    }
  );

  it("rejects an unknown serialization type", () => {
    expect(() => toRedisValue("unknown", "value")).toThrow(
      "Wrong type unknown"
    );
  });

  it("rejects an unknown deserialization type", () => {
    expect(() => fromRedisValue("unknown", "value")).toThrow(
      "Wrong type unknown"
    );
  });
});
