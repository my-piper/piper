import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import { vi } from "vitest";

export const NETWORK_BLOCKED_MESSAGE =
  "External connections are disabled in fast tests; mock the service boundary";

const connectSocket = net.Socket.prototype.connect;
let httpTestPort: number | undefined;

export function allowHttpTestServer(port: number) {
  httpTestPort = port;
}

export function blockNetwork() {
  httpTestPort = undefined;
  const rejectConnection = () => {
    throw new Error(NETWORK_BLOCKED_MESSAGE);
  };

  vi.spyOn(net.Socket.prototype, "connect").mockImplementation(function (
    this: net.Socket,
    ...args: unknown[]
  ) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const destination = first as { host?: string; port?: number; path?: string };
    if (
      httpTestPort !== undefined &&
      destination?.host === "127.0.0.1" &&
      Number(destination.port) === httpTestPort &&
      (destination.path === undefined || destination.path === null)
    ) {
      return connectSocket.apply(this, args);
    }
    return rejectConnection();
  });
  vi.spyOn(tls, "connect").mockImplementation(rejectConnection);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error(NETWORK_BLOCKED_MESSAGE)
  );
  syncBuiltinESMExports();
}
