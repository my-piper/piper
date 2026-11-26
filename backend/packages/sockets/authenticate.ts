import { createLogger } from "core-kit/packages/logger";
import { User } from "models/user";
import { resolveUser } from "packages/users/resolve-user";
import { Socket } from "socket.io";

const logger = createLogger("sockets");

// The handshake `auth` payload a client sends: the same tokens as the
// user-token and api-token HTTP headers.
export type SocketAuth = {
  token?: string;
  apiToken?: string;
};

export type SocketData = {
  user: User;
};

export const UNAUTHORIZED = "unauthorized";

// socket.io middleware: refuses a connection unless its handshake carries a
// valid user or API token, and keeps the user on `socket.data.user`.
export async function authenticate(
  socket: Socket,
  next: (err?: Error) => void
) {
  const { token, apiToken } = (socket.handshake.auth ?? {}) as SocketAuth;
  try {
    const user = await resolveUser({
      userToken: typeof token === "string" ? token : undefined,
      apiToken: typeof apiToken === "string" ? apiToken : undefined,
    });
    if (!user) {
      next(new Error(UNAUTHORIZED));
      return;
    }
    (socket.data as SocketData).user = user;
    next();
  } catch (err) {
    logger.warn(`Socket handshake refused: ${err}`);
    next(new Error(UNAUTHORIZED));
  }
}
