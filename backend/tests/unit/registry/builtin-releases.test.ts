import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Every file a released built-in package version serves, with its SHA-256.
// Scripts pin a version and Deno caches it forever (ADR 0003): a released
// file never changes. Put a change in a new version folder and add its
// files here.
const RELEASED = {
  "core/1/node.js":
    "2e4561af03aaee72fa81c506be5692c708cc982896531f5e5fca70205e4ccb27",
};

const ROOT = join(process.cwd(), "builtin-packages");

function files(dir: string): string[] {
  return (
    readdirSync(dir, { withFileTypes: true })
      // Hidden files (.DS_Store) are never package code.
      .filter((entry) => !entry.name.startsWith("."))
      .flatMap((entry) =>
        entry.isDirectory()
          ? files(join(dir, entry.name))
          : [relative(ROOT, join(dir, entry.name))]
      )
  );
}

describe("built-in package releases", () => {
  it("ships exactly the released files", () => {
    const shipped = files(ROOT).sort();

    expect(shipped).toEqual(Object.keys(RELEASED).sort());
  });

  it.each(Object.entries(RELEASED))("keeps %s unchanged", (path, sha256) => {
    const actual = createHash("sha256")
      .update(readFileSync(join(ROOT, path)))
      .digest("hex");

    expect(actual).toBe(sha256);
  });
});
