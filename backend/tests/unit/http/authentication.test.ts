import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { HTTP_TEST_SECRET, userToken } from "../../fixtures/http";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";

let scenario: ReturnType<typeof httpScenario>;
let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  scenario = httpScenario();
  context = await createHttpApp();
  const { handle, checkLogged } = await import("utils/http");
  const { toPlain } = await import("core-kit/packages/transform");
  context.app.get(
    "/identity",
    handle(({ currentUser }) => async () => {
      checkLogged(currentUser);
      return toPlain(currentUser);
    })
  );
});

describe("user-token authentication", () => {
  it("authenticates a signed token and loads current roles from storage", async () => {
    const token = userToken("owner-user");

    const response = await context.request
      .get("/identity")
      .set("user-token", token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      _id: "owner-user",
      email: "owner-user@example.com",
      roles: [],
      balance: { remaining: 10 },
    });
    expect(response.body.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(httpDoubles.users.findOne).toHaveBeenCalledWith(
      { _id: "owner-user" },
      { projection: { _id: 1, email: 1, roles: 1, balance: 1, createdAt: 1 } }
    );
  });

  it.each(["malformed", "wrong signature", "expired", "unknown user"])(
    "rejects a %s token",
    async (kind) => {
      const token =
        kind === "malformed"
          ? "not-a-token"
          : kind === "wrong signature"
            ? jwt.sign({ _id: "owner-user" }, "wrong-secret")
            : kind === "expired"
              ? userToken("owner-user", { expiresIn: -1 })
              : userToken("missing-user");

      const response = await context.request
        .get("/identity")
        .set("user-token", token);

      expect(response.status).toBe(401);
      expect(response.text).toBe("Wrong user token");
      expect(httpDoubles.captureException).not.toHaveBeenCalled();
    }
  );

  it("rejects a deleted user's otherwise valid token", async () => {
    const token = userToken();
    scenario.users.delete("owner-user");

    const response = await context.request
      .get("/identity")
      .set("user-token", token);

    expect(response.status).toBe(401);
  });

  it("does not trust roles supplied in token claims", async () => {
    const token = jwt.sign(
      { _id: "owner-user", roles: ["admin"] },
      HTTP_TEST_SECRET
    );

    const response = await context.request
      .get("/identity")
      .set("user-token", token);

    expect(response.status).toBe(200);
    expect(response.body.roles).toEqual([]);
  });

  it("retains the existing 400 response when no login is supplied", async () => {
    const response = await context.request.get("/identity");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: "You aren't logged",
      details: {},
    });
    expect(httpDoubles.users.findOne).not.toHaveBeenCalled();
  });
});

describe("api-token authentication", () => {
  it("verifies the JWT and bcrypt hash without mocking authentication", async () => {
    const token = userToken();
    scenario.redisResponses.set(
      "user:owner-user:api-token",
      await bcrypt.hash(token, 4)
    );

    const response = await context.request
      .get("/identity")
      .set("api-token", token);

    expect(response.status).toBe(200);
    expect(response.body._id).toBe("owner-user");
    expect(httpDoubles.redis.get).toHaveBeenCalledExactlyOnceWith(
      "user:owner-user:api-token"
    );
  });

  it.each([
    "revoked",
    "replaced hash",
    "malformed",
    "expired",
    "wrong signature",
  ])("rejects an API token that is %s", async (kind) => {
    const token =
      kind === "malformed"
        ? "not-a-token"
        : kind === "expired"
          ? userToken("owner-user", { expiresIn: -1 })
          : kind === "wrong signature"
            ? jwt.sign({ _id: "owner-user" }, "wrong-secret")
            : userToken();
    if (kind === "replaced hash")
      scenario.redisResponses.set(
        "user:owner-user:api-token",
        await bcrypt.hash("a replacement token", 4)
      );

    const response = await context.request
      .get("/identity")
      .set("api-token", token);

    expect(response.status).toBe(401);
    expect(response.text).toBe("Wrong API token");
    expect(httpDoubles.users.findOne).not.toHaveBeenCalled();
  });

  it("rejects a deleted API user even when its token hash still exists", async () => {
    const token = userToken();
    scenario.redisResponses.set(
      "user:owner-user:api-token",
      await bcrypt.hash(token, 4)
    );
    scenario.users.delete("owner-user");

    const response = await context.request
      .get("/identity")
      .set("api-token", token);

    expect(response.status).toBe(401);
    expect(response.text).toBe("Wrong API token");
  });

  it("uses the API identity when both token headers are valid", async () => {
    const token = userToken("admin-user");
    scenario.redisResponses.set(
      "user:admin-user:api-token",
      await bcrypt.hash(token, 4)
    );

    const response = await context.request
      .get("/identity")
      .set("user-token", userToken())
      .set("api-token", token);

    expect(response.status).toBe(200);
    expect(response.body._id).toBe("admin-user");
  });

  it("rejects an invalid user header even when the API header is valid", async () => {
    const token = userToken();
    scenario.redisResponses.set(
      "user:owner-user:api-token",
      await bcrypt.hash(token, 4)
    );

    const response = await context.request
      .get("/identity")
      .set("user-token", "invalid")
      .set("api-token", token);

    expect(response.status).toBe(401);
    expect(response.text).toBe("Wrong user token");
    expect(httpDoubles.redis.get).not.toHaveBeenCalled();
  });
});
