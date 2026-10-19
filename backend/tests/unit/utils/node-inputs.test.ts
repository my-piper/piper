import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { Launch } from "models/launch";
import { Node } from "models/node";
import { Pipeline } from "models/pipeline";
import { PipelineIOType } from "types/pipeline";
import {
  checkInputs,
  convertInput,
  convertInputs,
  getNodeInputs,
} from "utils/node";
import { describe, expect, it, vi } from "vitest";
import { pipelineFixture } from "../../fixtures/pipeline";

const { redis } = vi.hoisted(() => ({ redis: { get: vi.fn() } }));

vi.mock("core-kit/packages/redis", () => ({ default: redis }));
vi.mock("app/storage", () => ({}));

describe("node input conversion", () => {
  it.each([
    { type: "boolean", value: false, expected: false },
    { type: "integer", value: 0, expected: 0 },
    { type: "float", value: 1.25, expected: 1.25 },
    { type: "string", value: "", expected: "" },
    {
      type: "json",
      value: '{"items":[false,0,""]}',
      expected: { items: [false, 0, ""] },
    },
    { type: "json", value: "null", expected: null },
    ...["image", "archive", "audio", "video"].map((type) => ({
      type,
      value: "https://example.com/asset",
      expected: "https://example.com/asset",
    })),
    ...["string[]", "image[]", "video[]"].map((type) => ({
      type,
      value: "first|second",
      expected: ["first", "second"],
    })),
  ])("converts $type input $value", ({ type, value, expected }) => {
    const result = convertInput(value, type as PipelineIOType);

    expect(result).toEqual(expected);
  });

  it("rejects malformed JSON", () => {
    expect(() => convertInput("{broken", "json")).toThrow(SyntaxError);
  });

  it("rejects unsupported input types", () => {
    expect(() => convertInput("value", "unknown" as PipelineIOType)).toThrow(
      "Wrong input type unknown"
    );
  });

  it.each(["object", "map"])(
    "converts declared inputs from a %s and omits unknown or empty values",
    (container) => {
      const node = toInstance(
        {
          inputs: {
            enabled: { type: "boolean" },
            count: { type: "integer" },
            text: { type: "string" },
            payload: { type: "json" },
            empty: { type: "string", default: "a default" },
            missing: { type: "string", default: "a default" },
          },
        },
        Node
      );
      const values = {
        enabled: false,
        count: 0,
        text: "",
        payload: '{"ok":true}',
        empty: null,
        unexpected: "ignored",
      };
      const inputs =
        container === "map" ? new Map(Object.entries(values)) : values;

      const result = convertInputs({ node })(inputs);

      expect(result).toEqual({
        enabled: false,
        count: 0,
        text: "",
        payload: { ok: true },
      });
    }
  );

  it("uses pipeline input definitions when converting pipeline data", () => {
    const pipeline = toInstance(pipelineFixture(), Pipeline);

    const result = convertInputs({ pipeline })({
      enabled: false,
      count: 0,
      text: "",
    });

    expect(result).toEqual({ enabled: false, count: 0, text: "" });
  });

  it("reports the field and value when JSON conversion fails", () => {
    const node = toInstance({ inputs: { payload: { type: "json" } } }, Node);
    const convert = () => convertInputs({ node })({ payload: "{broken" });

    expect(convert).toThrow(DataError);
    expect(convert).toThrow(
      expect.objectContaining({
        message: "Can't convert input [payload]",
        details: { input: "payload", value: "{broken", type: "json" },
      })
    );
  });
});

describe("required input readiness", () => {
  it.each([false, 0, ""])("counts %j as a filled required input", (value) => {
    const node = toInstance(
      {
        inputs: {
          value: { type: "string", required: true },
          optional: { type: "string" },
        },
      },
      Node
    );

    const readiness = checkInputs({ value }, node.inputs);

    expect(readiness).toEqual({
      required: ["value"],
      filled: ["value"],
      ready: true,
    });
  });

  it.each([null, undefined])(
    "treats %j as unfilled even when a default exists",
    (value) => {
      const node = toInstance(
        {
          inputs: {
            value: { type: "string", required: true, default: "fallback" },
          },
        },
        Node
      );

      const readiness = checkInputs({ value }, node.inputs);

      expect(readiness).toEqual({
        required: ["value"],
        filled: [],
        ready: false,
      });
    }
  );

  it("is ready when there are no required inputs", () => {
    const node = toInstance({ inputs: { optional: { type: "string" } } }, Node);

    const readiness = checkInputs({}, node.inputs);

    expect(readiness).toEqual({ required: [], filled: [], ready: true });
  });
});

describe("reading node inputs from Redis", () => {
  it("decodes falsy values while omitting missing and explicit null inputs", async () => {
    const node = toInstance(
      {
        inputs: {
          enabled: { type: "boolean" },
          count: { type: "integer" },
          text: { type: "string" },
          empty: { type: "json" },
          missing: { type: "string" },
        },
      },
      Node
    );
    const launch = new Launch({ _id: "launch" });
    redis.get.mockImplementation(
      async (key: string) =>
        ({
          "launch:launch:nodes:echo:inputs:enabled": "",
          "launch:launch:nodes:echo:inputs:count": "0",
          "launch:launch:nodes:echo:inputs:text": "",
          "launch:launch:nodes:echo:inputs:empty": "<!null!>",
        })[key] ?? null
    );

    const inputs = await getNodeInputs({ launch, node })("echo");

    expect(inputs).toEqual({ enabled: false, count: 0, text: "" });
    expect(redis.get).toHaveBeenCalledTimes(5);
  });
});
