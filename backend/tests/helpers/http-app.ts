import type { Express } from "express";
import { createServer, Server } from "node:http";
import request from "supertest";
import { afterEach, vi } from "vitest";
import { allowHttpTestServer } from "./network";

const servers = new Set<Server>();

afterEach(async () => {
  for (const server of servers) await closeServer(server);
  servers.clear();
});

export async function createHttpApp(
  routes: Array<() => Promise<unknown>> = []
) {
  vi.resetModules();
  // Initialize the real decorators before loading routes through async mocks.
  await import("core-kit/types/errors");
  const { default: app } = await import("app/api");
  for (const load of routes) await load();

  const server = createServer(app as Express);
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("HTTP test server has no TCP address");
  allowHttpTestServer(address.port);

  return {
    app,
    server,
    port: address.port,
    request: request(`http://127.0.0.1:${address.port}`),
    close: () => closeServer(server),
  };
}

async function closeServer(server: Server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}
