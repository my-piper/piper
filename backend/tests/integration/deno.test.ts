import { ExecutionError } from "packages/deno/classes";
import { execute } from "packages/deno/execute";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(async () => {
  await vi.waitFor(
    async () => {
      const result = await execute(
        "export function ready() { return true; }",
        "ready",
        {}
      );
      expect(result.result).toBe(true);
    },
    { timeout: 30_000, interval: 200 }
  );
});

describe("real Deno service", () => {
  it.each(["none", "process"] as const)(
    "executes and serializes values with %s isolation",
    async (isolation) => {
      const script = `export function run({ inputs }) {
      console.info("smoke-log");
      return { __type: "next", outputs: { result: inputs } };
    }`;
      const inputs = { enabled: false, count: 0, text: "", nested: [1, null] };

      const result = await execute(
        script,
        "run",
        { inputs },
        { isolation, timeout: 3000 }
      );

      expect(result.result).toEqual({
        __type: "next",
        outputs: { result: inputs },
      });
      expect(result.logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ level: "info", message: "smoke-log" }),
        ])
      );
    }
  );

  it("maps a JavaScript exception to a real ExecutionError", async () => {
    const script =
      'export function run() { throw new Error("smoke failure"); }';

    const result = execute(
      script,
      "run",
      {},
      { isolation: "process", timeout: 3000 }
    );

    await expect(result).rejects.toBeInstanceOf(ExecutionError);
    await expect(result).rejects.toMatchObject({ message: "smoke failure" });
  });
});
