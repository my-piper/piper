import { createServer, Server } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowHttpTestServer } from "../../helpers/network";

const files = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("packages/registry/files", () => ({ getFile: files.getFile }));

let server: Server;
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("REGISTRY_TOKEN", "registry-secret");
  files.getFile.mockReset();
  const { createRegistryApp } = await import("packages/registry/server");
  server = createServer(createRegistryApp());
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Registry test server has no TCP address");
  allowHttpTestServer(address.port);
  agent = request.agent(`http://127.0.0.1:${address.port}`).timeout(2000);
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("package registry", () => {
  it("serves a package file as a module Deno can cache forever", async () => {
    files.getFile.mockResolvedValue(Buffer.from("export const x = 1;"));

    const response = await agent
      .get("/artworks/3/ask_llm_agent/script.js")
      .set("authorization", "Bearer registry-secret");

    expect(response.status).toBe(200);
    expect(response.text).toBe("export const x = 1;");
    expect(response.headers["content-type"]).toMatch(
      /^application\/javascript/
    );
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(files.getFile).toHaveBeenCalledWith(
      "artworks",
      3,
      "ask_llm_agent/script.js"
    );
  });

  it("refuses a request without a token", async () => {
    const response = await agent.get("/artworks/3/ask_llm_agent/script.js");

    expect(response.status).toBe(401);
    expect(files.getFile).not.toHaveBeenCalled();
  });

  it.each(["Bearer wrong", "registry-secret"])(
    "refuses a request with authorization %s",
    async (authorization) => {
      const response = await agent
        .get("/artworks/3/ask_llm_agent/script.js")
        .set("authorization", authorization);

      expect(response.status).toBe(401);
      expect(files.getFile).not.toHaveBeenCalled();
    }
  );

  it.each([
    "/artworks/3/missing.js",
    "/artworks/three/script.js",
    "/Artworks/3/script.js",
    "/artworks/3/..%2F..%2Fother%2F1%2Fscript.js",
  ])("answers 404 for %s", async (path) => {
    files.getFile.mockResolvedValue(null);

    const response = await agent
      .get(path)
      .set("authorization", "Bearer registry-secret");

    expect(response.status).toBe(404);
  });

  it("never reads another package's files through an encoded path", async () => {
    files.getFile.mockResolvedValue(Buffer.from("secret"));

    const response = await agent
      .get("/artworks/3/..%2F..%2Fprivate_pkg%2F1%2Fscript.js")
      .set("authorization", "Bearer registry-secret");

    expect(response.status).toBe(404);
    expect(files.getFile).not.toHaveBeenCalled();
  });
});
