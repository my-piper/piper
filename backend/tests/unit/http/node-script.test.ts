import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("packages/registry/files", () => ({ getFile: registry.getFile }));
let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  registry.getFile.mockReset();
  vi.stubEnv("REGISTRY_URL", "http://registry:8085");
  context = await createHttpApp([
    () => import("api/nodes/script-source"),
    () => import("api/nodes/prepare-script"),
  ]);
});

describe("node script source", () => {
  it("loads the source of a published package version for an engineer", async () => {
    registry.getFile.mockResolvedValue(
      Buffer.from('import { next } from "../node.js";')
    );

    const response = await context.request
      .post("/api/nodes/script-source")
      .set("user-token", userToken("engineer-user"))
      .send({ script: "registry:artworks@3/echo_node/script.js" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      source: 'import { next } from "../node.js";',
    });
    expect(registry.getFile).toHaveBeenCalledWith(
      "artworks",
      3,
      "echo_node/script.js"
    );
  });
  it.each(["owner-user", "other-user"])(
    "denies source access to %s before reading storage",
    async (user) => {
      const response = await context.request
        .post("/api/nodes/script-source")
        .set("user-token", userToken(user))
        .send({ script: "registry:artworks@3/echo_node/script.js" });

      expect(response.status).toBe(400);
      expect(registry.getFile).not.toHaveBeenCalled();
    }
  );

  it("returns 404 for a missing script", async () => {
    registry.getFile.mockResolvedValue(null);

    const response = await context.request
      .post("/api/nodes/script-source")
      .set("user-token", userToken("engineer-user"))
      .send({ script: "registry:artworks@3/echo_node/script.js" });

    expect(response.status).toBe(404);
  });

  it.each([
    "registry:artworks@3/../secret.js",
    "registry:artworks@3/%2e%2e/secret.js",
    "registry:artworks@3//secret.js",
  ])("rejects unsafe registry reference %s", async (script) => {
    const response = await context.request
      .post("/api/nodes/script-source")
      .set("user-token", userToken("engineer-user"))
      .send({ script });

    expect(response.status).toBe(400);
    expect(registry.getFile).not.toHaveBeenCalled();
  });

  it("loads pinned remote source without following redirects", async () => {
    const script =
      "https://cdn.jsdelivr.net/gh/my-piper/piper-nodes@v2.0.4/nodes/echo/script.js";
    httpDoubles.axios.mockResolvedValue({ data: "export function run() {}" });

    const response = await context.request
      .post("/api/nodes/script-source")
      .set("user-token", userToken("engineer-user"))
      .send({ script });

    expect(response.status).toBe(200);
    expect(response.body.source).toBe("export function run() {}");
    expect(httpDoubles.axios).toHaveBeenCalledWith(
      expect.objectContaining({ url: script, maxRedirects: 0, timeout: 10000 })
    );
  });

  it("loads existing unpinned scripts on custom Deno hosts", async () => {
    const script = "https://modules.example.com/nodes/echo/script.js";
    httpDoubles.axios.mockResolvedValue({ data: "export function run() {}" });

    const response = await context.request
      .post("/api/nodes/script-source")
      .set("user-token", userToken("engineer-user"))
      .send({ script });

    expect(response.status).toBe(200);
    expect(response.body.source).toBe("export function run() {}");
  });

  it("prepares and signs overrides while preserving comments and ordinary strings", async () => {
    const script = [
      '// import "../comment.js";',
      'const example = "../ordinary-string.js";',
      'import { next } from "../node.js";',
      'export { helper } from "./helper.js";',
      'const lazy = () => import("./lazy.js");',
      "const here = import.meta.url;",
    ].join("\n");

    const response = await context.request
      .post("/api/nodes/prepare-script")
      .set("user-token", userToken("engineer-user"))
      .send({
        node: { script },
        base: "registry:artworks@3/echo_node/script.js",
      });

    expect(response.status).toBe(200);
    expect(response.body.script).toBe(
      [
        '// import "../comment.js";',
        'const example = "../ordinary-string.js";',
        'import { next } from "http://registry:8085/artworks/3/node.js";',
        'export { helper } from "http://registry:8085/artworks/3/echo_node/helper.js";',
        'const lazy = () => import("http://registry:8085/artworks/3/echo_node/lazy.js");',
        'const here = "http://registry:8085/artworks/3/echo_node/script.js";',
      ].join("\n")
    );
    expect(response.body.sign).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps an unchanged module reference when signing an execution-only edit", async () => {
    const script = "registry:artworks@3/echo_node/script.js";

    const response = await context.request
      .post("/api/nodes/prepare-script")
      .set("user-token", userToken("engineer-user"))
      .send({ node: { script } });

    expect(response.status).toBe(200);
    expect(response.body.script).toBe(script);
    expect(response.body.sign).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reports unsupported computed imports instead of silently breaking them", async () => {
    const response = await context.request
      .post("/api/nodes/prepare-script")
      .set("user-token", userToken("engineer-user"))
      .send({
        node: { script: "export const lazy = (name) => import(name);" },
        base: "registry:artworks@3/echo_node/script.js",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("string literals");
  });
});
