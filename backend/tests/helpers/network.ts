import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import { vi } from "vitest";

export const NETWORK_BLOCKED_MESSAGE =
  "External connections are disabled in fast tests; mock the service boundary";

export function blockNetwork() {
  const rejectConnection = () => {
    throw new Error(NETWORK_BLOCKED_MESSAGE);
  };

  vi.spyOn(net.Socket.prototype, "connect").mockImplementation(
    rejectConnection
  );
  vi.spyOn(tls, "connect").mockImplementation(rejectConnection);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error(NETWORK_BLOCKED_MESSAGE)
  );
  syncBuiltinESMExports();
}
