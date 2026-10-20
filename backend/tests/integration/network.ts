import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import { vi } from "vitest";

const connectSocket = net.Socket.prototype.connect;

export function restrictNetwork() {
  const ports = [
    new URL(process.env.MONGO_URL).port,
    process.env.BULL_REDIS_PORT,
    new URL(process.env.DENO_URL).port,
  ].map(Number);
  const reject = () => {
    throw new Error(
      "Integration connections must use this run's disposable services"
    );
  };

  vi.spyOn(net.Socket.prototype, "connect").mockImplementation(function (
    this: net.Socket,
    ...args: unknown[]
  ) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const destination = first as {
      host?: string;
      port?: number;
      path?: string;
    };
    if (
      destination?.host === "127.0.0.1" &&
      ports.includes(Number(destination.port)) &&
      (destination.path === undefined || destination.path === null)
    ) {
      return connectSocket.apply(this, args);
    }
    return reject();
  });
  vi.spyOn(tls, "connect").mockImplementation(reject);
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => reject());
  syncBuiltinESMExports();
}
