import { beforeEach, describe, expect, it, vi } from "vitest";

const s3 = vi.hoisted(() => ({
  load: vi.fn(),
  exists: vi.fn(),
  putPrivate: vi.fn(),
}));
vi.mock("app/s3", () => s3);

const { getFile } = await import("packages/registry/files");

beforeEach(() => {
  s3.load.mockReset();
});

describe("built-in core package", () => {
  it("serves core from the files shipped with Piper, without the bucket", async () => {
    const data = await getFile("core", 1, "node.js");

    expect(data?.toString()).toContain("export async function download(");
    expect(s3.load).not.toHaveBeenCalled();
  });

  it("answers null for a core version or file Piper doesn't ship", async () => {
    const missingVersion = await getFile("core", 999, "node.js");
    const missingFile = await getFile("core", 1, "missing.js");

    expect(missingVersion).toBeNull();
    expect(missingFile).toBeNull();
    expect(s3.load).not.toHaveBeenCalled();
  });

  it.each(["../../package.json", "../1/node.js", "/etc/passwd", "a\u0000.js"])(
    "refuses core path %s that leaves its version folder",
    async (path) => {
      const data = await getFile("core", 1, path);

      expect(data).toBeNull();
    }
  );

  it("reads every other package from the bucket", async () => {
    s3.load.mockResolvedValue(Buffer.from("export const x = 1;"));

    const data = await getFile("artworks", 7, "node.js");

    expect(data?.toString()).toBe("export const x = 1;");
    expect(s3.load).toHaveBeenCalledWith(
      "artworks/7/node.js",
      expect.any(String)
    );
  });
});
