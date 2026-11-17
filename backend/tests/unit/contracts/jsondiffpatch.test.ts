import { diff, patch } from "jsondiffpatch/with-text-diffs";
import { afterEach, describe, expect, it } from "vitest";

// api/projects/patch-project.ts applies client-sent deltas with `patch`.
// jsondiffpatch <= 0.7.5 followed `__proto__`/`constructor.prototype` keys in
// a delta (GHSA-j4fx-xxwh-2485); on 0.6.0 such a delta also hung the process.
describe("jsondiffpatch with client-sent deltas", () => {
  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>)["polluted"];
  });

  it.each([
    { name: "__proto__", delta: '{"__proto__":{"polluted":["yes"]}}' },
    {
      name: "constructor.prototype",
      delta: '{"constructor":{"prototype":{"polluted":["yes"]}}}',
    },
  ])("ignores a $name delta", ({ delta }) => {
    const target = { title: "pipeline" };

    patch(target, JSON.parse(delta));

    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(target).toEqual({ title: "pipeline" });
  });

  it("round-trips a regular delta", () => {
    const before = { nodes: { a: { title: "A" } }, tags: ["x"] };
    const after = { nodes: { a: { title: "B" }, b: { title: "C" } }, tags: [] };
    const delta = diff(before, after);

    const patched = patch(structuredClone(before), delta);

    expect(patched).toEqual(after);
  });

  // The frontend diffs long strings (scripts, descriptions) into unidiff text
  // deltas; the main 0.7 entry throws on them without diff-match-patch.
  it("applies a text delta for a long string", () => {
    const script = "export async function run() {\n".repeat(4);
    const delta = diff({ script }, { script: `${script}// done\n` });

    const patched = patch({ script }, delta);

    expect(delta).toEqual({ script: [expect.stringMatching(/^@@ /), 0, 2] });
    expect(patched).toEqual({ script: `${script}// done\n` });
  });
});
