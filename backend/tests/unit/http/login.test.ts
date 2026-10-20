import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import {
  HTTP_TEST_PASSWORD,
  HTTP_TEST_SECRET,
  HTTP_TEST_TIME,
  userToken,
} from "../../fixtures/http";
import bcrypt from "bcrypt";
import { USER_API_TOKEN_EXPIRED, USER_API_TOKEN_KEY } from "consts/redis";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

let scenario: ReturnType<typeof httpScenario>;
let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  scenario = httpScenario();
  context = await createHttpApp([
    () => import("api/users/login"),
    () => import("api/users/generate-api-token"),
    () => import("api/me/get-me"),
  ]);
});

describe("password login", () => {
  it.each(["owner-user", "owner-user@example.com"])(
    "issues a user token for identity %s",
    async (identity) => {
      const response = await context.request
        .post("/api/login")
        .send({ identity, password: HTTP_TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.user).toEqual({
        _id: "owner-user",
        email: "owner-user@example.com",
      });
      expect(jwt.verify(response.body.token, HTTP_TEST_SECRET)).toMatchObject({
        _id: "owner-user",
        email: "owner-user@example.com",
      });
      expect(httpDoubles.users.findOne).toHaveBeenCalledWith(
        { $or: [{ _id: identity }, { email: identity }] },
        { projection: { email: 1, password: 1 } }
      );
    }
  );

  it("accepts the issued token on authenticated routes", async () => {
    const login = await context.request
      .post("/api/login")
      .send({ identity: "owner-user", password: HTTP_TEST_PASSWORD });

    const response = await context.request
      .get("/api/me")
      .set("user-token", login.body.token);

    expect(response.status).toBe(200);
    expect(response.body._id).toBe("owner-user");
  });

  it.each([
    { identity: "owner-user", password: "wrong-password" },
    { identity: "missing-user", password: HTTP_TEST_PASSWORD },
  ])(
    "returns the same error for $identity with a bad credential",
    async (credentials) => {
      const response = await context.request
        .post("/api/login")
        .send(credentials);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Email or password is incorrect");
      expect(response.body).not.toHaveProperty("token");
    }
  );

  it("asks users without a password to reset it", async () => {
    delete scenario.users.get("owner-user").password;

    const response = await context.request
      .post("/api/login")
      .send({ identity: "owner-user", password: HTTP_TEST_PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You need to reset your password");
  });

  it.each(["short", "a-password-longer-than-20"])(
    "validates password length before reading users (%s)",
    async (password) => {
      const response = await context.request
        .post("/api/login")
        .send({ identity: "owner-user", password });

      expect(response.status).toBe(400);
      expect(httpDoubles.users.findOne).not.toHaveBeenCalled();
    }
  );

  it("does not pass query operators from the identity to MongoDB", async () => {
    const response = await context.request
      .post("/api/login")
      .send({ identity: { $ne: null }, password: HTTP_TEST_PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body).not.toHaveProperty("token");
  });
});

describe("API token generation", () => {
  it("stores a bcrypt hash of a token that authenticates as the user", async () => {
    const generated = await context.request
      .post("/api/me/api-token/generate")
      .set("user-token", userToken());
    const [key, expiry, hash] = httpDoubles.redis.setEx.mock.calls[0];
    scenario.redisResponses.set(key, hash);

    const response = await context.request
      .get("/api/me")
      .set("api-token", generated.body.token);

    expect(generated.status).toBe(200);
    expect(key).toBe(USER_API_TOKEN_KEY("owner-user"));
    expect(expiry).toBe(USER_API_TOKEN_EXPIRED);
    expect(hash).not.toBe(generated.body.token);
    expect(await bcrypt.compare(generated.body.token, hash)).toBe(true);
    expect(response.status).toBe(200);
    expect(response.body._id).toBe("owner-user");
  });

  // Known bug: bcrypt only reads the first 72 bytes, which end before the JWT
  // issue time and signature, so any API token for the user matches any hash.
  it.fails(
    "revokes the previous API token when a new one is generated",
    async () => {
      const first = await context.request
        .post("/api/me/api-token/generate")
        .set("user-token", userToken());
      // Tokens issued in the same second have identical claims.
      vi.setSystemTime(HTTP_TEST_TIME.getTime() + 2000);
      await context.request
        .post("/api/me/api-token/generate")
        .set("user-token", userToken());
      const [key, , hash] = httpDoubles.redis.setEx.mock.calls[1];
      scenario.redisResponses.set(key, hash);

      const response = await context.request
        .get("/api/me")
        .set("api-token", first.body.token);

      expect(response.status).toBe(401);
      expect(response.text).toBe("Wrong API token");
    }
  );

  it("rejects anonymous generation without storing a hash", async () => {
    const response = await context.request.post("/api/me/api-token/generate");

    expect(response.status).toBe(400);
    expect(httpDoubles.redis.setEx).not.toHaveBeenCalled();
  });
});
