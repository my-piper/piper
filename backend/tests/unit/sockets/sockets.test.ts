import { httpDoubles } from "../../helpers/http-boundaries";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import bcrypt from "bcrypt";
import { User } from "models/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LAUNCH_ID = "launch-test";

let scenario: ReturnType<typeof httpScenario>;
let sockets: typeof import("packages/sockets");

beforeEach(async () => {
  scenario = httpScenario();
  httpDoubles.launches.findOne.mockImplementation(async ({ _id }) =>
    _id === LAUNCH_ID
      ? {
          _id,
          launchedBy: { _id: "other-user" },
          project: { _id: "project-http", createdBy: { _id: "owner-user" } },
        }
      : null
  );
  sockets = await import("packages/sockets");
});

function handshake(auth: object | undefined) {
  return { handshake: { auth }, data: {} } as never as Parameters<
    typeof sockets.authenticate
  >[0];
}

async function connect(auth: object | undefined) {
  const socket = handshake(auth);
  const next = vi.fn();

  await sockets.authenticate(socket, next);

  return { socket, next };
}

function user(_id: string, roles: string[] = []) {
  return new User({ _id, roles } as Partial<User>);
}

describe("socket handshake", () => {
  it("keeps the user behind a valid user token", async () => {
    const { socket, next } = await connect({ token: userToken() });

    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(socket.data.user._id).toBe("owner-user");
  });

  it("keeps the user behind a valid API token", async () => {
    const token = userToken();
    scenario.redisResponses.set(
      "user:owner-user:api-token",
      await bcrypt.hash(token, 4)
    );

    const { socket, next } = await connect({ apiToken: token });

    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(socket.data.user._id).toBe("owner-user");
  });

  it.each([
    { kind: "no auth payload", auth: undefined },
    { kind: "no token", auth: {} },
    { kind: "a non-string token", auth: { token: 42 } },
    { kind: "a forged user token", auth: { token: "invalid" } },
    {
      kind: "a user token of a deleted user",
      auth: { token: userToken("gone") },
    },
    { kind: "a revoked API token", auth: { apiToken: userToken() } },
  ])("refuses a handshake with $kind", async ({ auth }) => {
    const { socket, next } = await connect(auth);

    expect(next).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: sockets.UNAUTHORIZED })
    );
    expect(socket.data).not.toHaveProperty("user");
  });

  it("refuses a handshake with an expired user token", async () => {
    const token = userToken("owner-user", { expiresIn: -1 });

    const { socket, next } = await connect({ token });

    expect(next).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: sockets.UNAUTHORIZED })
    );
    expect(socket.data).not.toHaveProperty("user");
  });
});

describe("room authorization", () => {
  it.each([
    { room: "user:owner-user", who: user("owner-user"), allowed: true },
    { room: "user:other-user", who: user("owner-user"), allowed: false },
    {
      room: "user:other-user",
      who: user("admin-user", ["admin"]),
      allowed: false,
    },
    { room: `launch:${LAUNCH_ID}`, who: user("other-user"), allowed: true },
    { room: `launch:${LAUNCH_ID}`, who: user("owner-user"), allowed: true },
    {
      room: `launch:${LAUNCH_ID}`,
      who: user("admin-user", ["admin"]),
      allowed: true,
    },
    { room: `launch:${LAUNCH_ID}`, who: user("stranger"), allowed: false },
    { room: "launch:missing", who: user("owner-user"), allowed: false },
    { room: "packages", who: user("admin-user", ["admin"]), allowed: true },
    { room: "packages", who: user("owner-user"), allowed: false },
    { room: "owner-user", who: user("owner-user"), allowed: false },
    { room: LAUNCH_ID, who: user("owner-user"), allowed: false },
    {
      room: "updating_packages",
      who: user("admin-user", ["admin"]),
      allowed: false,
    },
  ])(
    "answers $allowed for $who._id joining $room",
    async ({ room, who, allowed }) => {
      const result = await sockets.authorizeRoom(who, room);

      expect(result).toBe(allowed);
    }
  );

  it("does not hide a database failure as a refusal", async () => {
    const failure = new Error("database offline");
    httpDoubles.launches.findOne.mockRejectedValue(failure);

    const result = sockets.authorizeRoom(
      user("owner-user"),
      `launch:${LAUNCH_ID}`
    );

    await expect(result).rejects.toBe(failure);
  });
});
