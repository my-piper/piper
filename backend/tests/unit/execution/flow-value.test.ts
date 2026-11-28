import "reflect-metadata";
import { flowValue } from "packages/nodes/flow-value";
import { describe, expect, it } from "vitest";

const json = JSON.stringify({ a: { flag: 1, n: "42.5", s: 7, o: { k: 1 } } });

describe("the value a flow carries", () => {
  it.each([
    {
      transformer: null,
      output: "string",
      input: "string",
      value: "x",
      carried: "x",
    },
    {
      transformer: null,
      output: "integer",
      input: "integer",
      value: 0,
      carried: 0,
    },
    {
      transformer: { type: "json", path: "a.flag" },
      output: "json",
      input: "boolean",
      value: json,
      carried: true,
    },
    {
      transformer: { type: "json", path: "a.s" },
      output: "json",
      input: "integer",
      value: json,
      carried: 7,
    },
    {
      transformer: { type: "json", path: "a.n" },
      output: "json",
      input: "integer",
      value: json,
      carried: 42,
    },
    {
      transformer: { type: "json", path: "a.n" },
      output: "json",
      input: "float",
      value: json,
      carried: 42.5,
    },
    {
      transformer: { type: "json", path: "a.s" },
      output: "json",
      input: "float",
      value: json,
      carried: 7,
    },
    {
      transformer: { type: "json", path: "a.n" },
      output: "json",
      input: "string",
      value: json,
      carried: "42.5",
    },
    {
      transformer: { type: "json", path: "a.s" },
      output: "json",
      input: "string",
      value: json,
      carried: "7",
    },
    {
      transformer: { type: "json", path: "a.o" },
      output: "json",
      input: "json",
      value: json,
      carried: '{"k":1}',
    },
    {
      transformer: { type: "json", path: "a.o" },
      output: "json",
      input: "integer",
      value: json,
      carried: undefined,
    },
    {
      transformer: { type: "json", path: "a.o" },
      output: "json",
      input: "string",
      value: json,
      carried: undefined,
    },
    {
      transformer: { type: "json", path: "a.s" },
      output: "json",
      input: "json",
      value: json,
      carried: undefined,
    },
    {
      transformer: { type: "json", path: "a.s" },
      output: "json",
      input: "image",
      value: json,
      carried: undefined,
    },
    {
      transformer: { type: "json", path: "a.missing" },
      output: "json",
      input: "string",
      value: json,
      carried: undefined,
    },
    {
      transformer: { type: "json", path: "" },
      output: "json",
      input: "string",
      value: json,
      carried: undefined,
    },
    {
      transformer: { type: "json", path: "a" },
      output: "json",
      input: "string",
      value: "{not json",
      carried: undefined,
    },
    {
      transformer: { type: "array", index: 1 },
      output: "image[]",
      input: "image",
      value: "a.png|b.png",
      carried: "b.png",
    },
    {
      transformer: { type: "array", index: 9 },
      output: "image[]",
      input: "image",
      value: "a.png|b.png",
      carried: "b.png",
    },
    {
      transformer: { type: "array", index: 0 },
      output: "image[]",
      input: "image",
      value: "",
      carried: null,
    },
    {
      transformer: { type: "array", index: 0 },
      output: "image[]",
      input: "string",
      value: "a.png",
      carried: undefined,
    },
    {
      transformer: { type: "array", index: 0 },
      output: "string[]",
      input: "image",
      value: "a.png",
      carried: undefined,
    },
  ] as const)(
    "$transformer.type $transformer.path $output > $input carries $carried",
    ({ transformer, output, input, value, carried }) => {
      const flow = { transformer: transformer as never };

      const result = flowValue(flow, { type: output }, { type: input }, value);

      expect(result).toEqual(carried);
    }
  );
});
