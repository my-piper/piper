import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as YAML from "yaml";

const registry = vi.hoisted(() => ({ putFile: vi.fn(), hasFile: vi.fn() }));
vi.mock("packages/registry/files", () => ({
  putFile: registry.putFile,
  hasFile: registry.hasFile,
}));

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  registry.putFile.mockReset();
  registry.putFile.mockResolvedValue(undefined);
  registry.hasFile.mockReset();
  registry.hasFile.mockResolvedValue(false);
  context = await createHttpApp([
    // Through the index server.ts imports, so the route must be registered.
    () => import("api/node-packages"),
  ]);
});

function archive(version = 3) {
  const files: Record<string, string> = {
    "package.yaml": YAML.stringify({
      _id: "artworks",
      version,
      title: "ArtWorks",
      description: "ArtWorks image nodes",
    }),
    "node.js": "export function next(x) { return x; }",
    "ask_llm_agent/schema.yaml": YAML.stringify({
      title: "Ask LLM agent",
      execution: "regular",
      arrange: { x: 0, y: 0 },
      inputs: { prompt: { type: "string", title: "Prompt" } },
      outputs: { answer: { type: "string", title: "Answer" } },
    }),
    "ask_llm_agent/script.js":
      'import { next } from "../node.js"; export function run() {}',
    "ask_llm_agent/test.js": "Deno.test('x', () => {});",
  };
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([path, content]) => [path, strToU8(content)])
      )
    )
  );
}

function upload(user: string, data: Buffer) {
  return context.request
    .post("/api/node-packages/actions/upload-archive")
    .set("user-token", userToken(user))
    .attach("file", data, "artworks.zip");
}

describe("uploading a package archive", () => {
  it.each(["owner-user", "engineer-user"])(
    "rejects an upload by %s before writing anything",
    async (user) => {
      const response = await upload(user, archive());

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("You aren't admin");
      expect(registry.putFile).not.toHaveBeenCalled();
      expect(httpDoubles.nodes.bulkWrite).not.toHaveBeenCalled();
    }
  );

  it("writes the package code to the registry and points nodes at it", async () => {
    httpDoubles.nodePackages.findOne.mockResolvedValue({
      _id: "artworks",
      version: 2,
    });

    const response = await upload("admin-user", archive(3));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      nodePackage: "artworks",
      version: 3,
      nodes: ["ask_llm_agent"],
      dropped: ["ask_llm_agent/test.js"],
    });
    const written = registry.putFile.mock.calls.map(([pkg, version, path]) =>
      [pkg, version, path].join(" ")
    );
    expect(written.sort()).toEqual([
      "artworks 3 ask_llm_agent/schema.yaml",
      "artworks 3 ask_llm_agent/script.js",
      "artworks 3 node.js",
      "artworks 3 package.yaml",
    ]);
    const [[bulk]] = httpDoubles.nodes.bulkWrite.mock.calls;
    expect(bulk).toEqual([
      {
        updateOne: {
          filter: { _id: "ask_llm_agent" },
          update: {
            $set: expect.objectContaining({
              package: "artworks",
              script: "registry:artworks@3/ask_llm_agent/script.js",
              sign: expect.any(String),
            }),
          },
          upsert: true,
        },
      },
    ]);
  });

  it.each([{ current: 3 }, { current: 4 }])(
    "rejects version 3 when version $current is already published",
    async ({ current }) => {
      httpDoubles.nodePackages.findOne.mockResolvedValue({
        _id: "artworks",
        version: current,
      });

      const response = await upload("admin-user", archive(3));

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        `Package artworks already has version ${current}; publish a greater version`
      );
      expect(registry.putFile).not.toHaveBeenCalled();
    }
  );

  it("rejects nodes that already belong to another package", async () => {
    httpDoubles.nodesCursor.toArray.mockResolvedValue([
      { _id: "ask_llm_agent", package: "open_router" },
    ]);

    const response = await upload("admin-user", archive());

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Nodes belong to other packages");
    expect(response.body.details).toEqual(["ask_llm_agent: open_router"]);
    expect(registry.putFile).not.toHaveBeenCalled();
  });

  it("writes the manifest last so an interrupted upload can be retried", async () => {
    const response = await upload("admin-user", archive(3));

    expect(response.status).toBe(200);
    const paths = registry.putFile.mock.calls.map(([, , path]) => path);
    expect(paths.at(-1)).toBe("package.yaml");
  });

  it("never overwrites a version already completed in the registry", async () => {
    registry.hasFile.mockResolvedValue(true);

    const response = await upload("admin-user", archive(3));

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Package artworks version 3 is already in the registry; publish a greater version"
    );
    expect(registry.hasFile).toHaveBeenCalledWith(
      "artworks",
      3,
      "package.yaml"
    );
    expect(registry.putFile).not.toHaveBeenCalled();
  });

  it("refuses an archive larger than 20 MB before reading it", async () => {
    const data = Buffer.alloc(21 * 1024 * 1024);

    const response = await upload("admin-user", data);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Archive is larger than 20 MB");
    expect(registry.putFile).not.toHaveBeenCalled();
  });

  it("asks for a file when none is attached", async () => {
    const response = await context.request
      .post("/api/node-packages/actions/upload-archive")
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Attach a package archive as file");
  });
});
