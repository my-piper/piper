import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { GLOBAL_ENVIRONMENT_KEY, USER_ENVIRONMENT_KEY } from "consts/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { decrypt, encrypt } from "packages/environment/crypt-environment";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;
let redisResponses: Map<string, string>;

beforeEach(async () => {
  ({ redisResponses } = httpScenario());
  context = await createHttpApp([() => import("api/environment")]);
});

function storeUserEnvironment(user: string, variables: object) {
  const environment = toInstance({ variables }, Environment);
  encrypt(environment);
  redisResponses.set(
    USER_ENVIRONMENT_KEY(user),
    JSON.stringify(toPlain(environment))
  );
}

/** Variables written to Redis, decrypted, keyed by the Redis key. */
function writtenEnvironments() {
  return Object.fromEntries(
    httpDoubles.redis.set.mock.calls.map(([key, json]) => {
      const environment = toInstance(JSON.parse(json), Environment);
      decrypt(environment);
      return [key, Object.fromEntries(environment.variables)];
    })
  );
}

describe("user environment variable removal", () => {
  it("removes one variable and keeps the others", async () => {
    storeUserEnvironment("owner-user", {
      OPENAI_KEY: "sk-user",
      RETRIES: 3,
    });

    const response = await context.request
      .delete("/api/me/environment/OPENAI_KEY")
      .set("user-token", userToken());

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: { RETRIES: 3 },
    });
  });

  it("does nothing when the user has no environment", async () => {
    const response = await context.request
      .delete("/api/me/environment/OPENAI_KEY")
      .set("user-token", userToken());

    expect(response.status).toBe(204);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests", async () => {
    const response = await context.request.delete(
      "/api/me/environment/OPENAI_KEY"
    );

    expect(response.status).toBe(400);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });
});

describe("platform environment keys", () => {
  it("lists the names the platform provides without their values", async () => {
    const environment = toInstance(
      { variables: { OPENAI_KEY: "sk-platform", RETRIES: 3 } },
      Environment
    );
    encrypt(environment);
    redisResponses.set(
      GLOBAL_ENVIRONMENT_KEY,
      JSON.stringify(toPlain(environment))
    );

    const response = await context.request
      .get("/api/environment/keys")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ keys: ["OPENAI_KEY", "RETRIES"] });
  });

  it("lists nothing when the platform has no environment", async () => {
    const response = await context.request
      .get("/api/environment/keys")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ keys: [] });
  });

  it("rejects anonymous requests", async () => {
    const response = await context.request.get("/api/environment/keys");

    expect(response.status).toBe(400);
  });
});
