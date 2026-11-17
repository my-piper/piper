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

function storeUserEnvironment(
  user: string,
  variables: object,
  visible?: string[]
) {
  const environment = toInstance({ variables, visible }, Environment);
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

describe("user environment read", () => {
  it("shows Visible Variables and hides Secret Variables", async () => {
    storeUserEnvironment(
      "owner-user",
      { OPENAI_KEY: "sk-user", BASE_URL: "https://api.example", RETRIES: 3 },
      ["BASE_URL"]
    );

    const response = await context.request
      .get("/api/me/environment")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body.variables).toEqual({
      OPENAI_KEY: "[encrypted]",
      BASE_URL: "https://api.example",
      RETRIES: 3,
    });
    expect(response.body.visible).toEqual(["BASE_URL"]);
  });

  it("hides every string Variable of an environment saved before visibility", async () => {
    storeUserEnvironment("owner-user", { OPENAI_KEY: "sk-user", RETRIES: 3 });

    const response = await context.request
      .get("/api/me/environment")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body.variables).toEqual({
      OPENAI_KEY: "[encrypted]",
      RETRIES: 3,
    });
  });
});

/** Visible names written to Redis, keyed by the Redis key. */
function writtenVisible() {
  return Object.fromEntries(
    httpDoubles.redis.set.mock.calls.map(([key, json]) => [
      key,
      JSON.parse(json).visible,
    ])
  );
}

describe("user environment save", () => {
  it("stores which Variables are visible", async () => {
    storeUserEnvironment("owner-user", { OPENAI_KEY: "sk-user" });

    const response = await context.request
      .put("/api/me/environment")
      .set("user-token", userToken())
      .send({
        variables: { BASE_URL: "https://api.example" },
        visible: ["BASE_URL"],
      });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: {
        OPENAI_KEY: "sk-user",
        BASE_URL: "https://api.example",
      },
    });
    expect(writtenVisible()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: ["BASE_URL"],
    });
  });

  it("drops the value of a Secret Variable made visible without a new value", async () => {
    storeUserEnvironment("owner-user", { OPENAI_KEY: "sk-user", OTHER: "o" });

    const response = await context.request
      .put("/api/me/environment")
      .set("user-token", userToken())
      .send({ variables: {}, visible: ["OPENAI_KEY"] });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: { OTHER: "o" },
    });
    expect(writtenVisible()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: [],
    });
  });

  it("keeps the value of a Secret Variable made visible with a new value", async () => {
    storeUserEnvironment("owner-user", { OPENAI_KEY: "sk-user" });

    const response = await context.request
      .put("/api/me/environment")
      .set("user-token", userToken())
      .send({ variables: { OPENAI_KEY: "sk-new" }, visible: ["OPENAI_KEY"] });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: { OPENAI_KEY: "sk-new" },
    });
  });

  it("makes a Visible Variable secret again", async () => {
    storeUserEnvironment("owner-user", { BASE_URL: "https://a" }, ["BASE_URL"]);

    const response = await context.request
      .put("/api/me/environment")
      .set("user-token", userToken())
      .send({ variables: {}, visible: [] });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: { BASE_URL: "https://a" },
    });
    expect(writtenVisible()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: [],
    });
  });

  it("doesn't mark a name visible before it has a Variable", async () => {
    storeUserEnvironment("owner-user", { OPENAI_KEY: "sk-user" });

    const response = await context.request
      .put("/api/me/environment")
      .set("user-token", userToken())
      .send({ variables: {}, visible: ["LATER_KEY"] });

    expect(response.status).toBe(204);
    expect(writtenVisible()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: [],
    });
  });

  it("only lets string Variables be visible", async () => {
    storeUserEnvironment("owner-user", { RETRIES: 3 });

    const response = await context.request
      .put("/api/me/environment")
      .set("user-token", userToken())
      .send({ variables: {}, visible: ["RETRIES"] });

    expect(response.status).toBe(204);
    expect(writtenVisible()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: [],
    });
  });

  it("keeps the stored visibility when the request doesn't send it", async () => {
    storeUserEnvironment("owner-user", { BASE_URL: "https://a" }, ["BASE_URL"]);

    const response = await context.request
      .put("/api/me/environment")
      .set("user-token", userToken())
      .send({ variables: { BASE_URL: "https://b" } });

    expect(response.status).toBe(204);
    expect(writtenVisible()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: ["BASE_URL"],
    });
  });
});

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

  it("forgets that a removed Variable was visible", async () => {
    storeUserEnvironment("owner-user", { BASE_URL: "https://a", RETRIES: 3 }, [
      "BASE_URL",
    ]);

    const response = await context.request
      .delete("/api/me/environment/BASE_URL")
      .set("user-token", userToken());

    expect(response.status).toBe(204);
    expect(writtenVisible()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: [],
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

describe("user environment variable rename", () => {
  it("moves the stored value to the new name", async () => {
    storeUserEnvironment("owner-user", {
      OPENAI_KEY: "sk-user",
      RETRIES: 3,
    });

    const response = await context.request
      .post("/api/me/environment/OPENAI_KEY/rename")
      .set("user-token", userToken())
      .send({ name: "OPENAI_API_KEY" });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: {
        OPENAI_API_KEY: "sk-user",
        RETRIES: 3,
      },
    });
  });

  it("keeps a renamed Visible Variable visible", async () => {
    storeUserEnvironment("owner-user", { BASE_URL: "https://a" }, ["BASE_URL"]);

    const response = await context.request
      .post("/api/me/environment/BASE_URL/rename")
      .set("user-token", userToken())
      .send({ name: "API_URL" });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: { API_URL: "https://a" },
    });
    expect(writtenVisible()).toEqual({
      [USER_ENVIRONMENT_KEY("owner-user")]: ["API_URL"],
    });
  });

  it("refuses a name another variable already has", async () => {
    storeUserEnvironment("owner-user", {
      OPENAI_KEY: "sk-user",
      OPENAI_API_KEY: "sk-other",
    });

    const response = await context.request
      .post("/api/me/environment/OPENAI_KEY/rename")
      .set("user-token", userToken())
      .send({ name: "OPENAI_API_KEY" });

    expect(response.status).toBe(400);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });

  it.each([
    { name: "", status: 400 },
    { name: "bad key", status: 400 },
    { name: "1ST", status: 400 },
    { name: undefined, status: 400 },
  ])("refuses the invalid name $name", async ({ name, status }) => {
    storeUserEnvironment("owner-user", { OPENAI_KEY: "sk-user" });

    const response = await context.request
      .post("/api/me/environment/OPENAI_KEY/rename")
      .set("user-token", userToken())
      .send({ name });

    expect(response.status).toBe(status);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });

  it("answers 404 when the variable isn't stored", async () => {
    storeUserEnvironment("owner-user", { RETRIES: 3 });

    const response = await context.request
      .post("/api/me/environment/OPENAI_KEY/rename")
      .set("user-token", userToken())
      .send({ name: "OPENAI_API_KEY" });

    expect(response.status).toBe(404);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });

  it("answers 404 when the user has no environment", async () => {
    const response = await context.request
      .post("/api/me/environment/OPENAI_KEY/rename")
      .set("user-token", userToken())
      .send({ name: "OPENAI_API_KEY" });

    expect(response.status).toBe(404);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests", async () => {
    const response = await context.request
      .post("/api/me/environment/OPENAI_KEY/rename")
      .send({ name: "OPENAI_API_KEY" });

    expect(response.status).toBe(400);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });
});

function storePlatformEnvironment(variables: object, visible?: string[]) {
  const environment = toInstance({ variables, visible }, Environment);
  encrypt(environment);
  redisResponses.set(
    GLOBAL_ENVIRONMENT_KEY,
    JSON.stringify(toPlain(environment))
  );
}

describe("platform environment", () => {
  it("shows its Visible Variables to an admin and hides the secret ones", async () => {
    storePlatformEnvironment(
      { OPENAI_KEY: "sk-platform", BASE_URL: "https://a" },
      ["BASE_URL"]
    );

    const response = await context.request
      .get("/api/environment")
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(response.body.variables).toEqual({
      OPENAI_KEY: "[encrypted]",
      BASE_URL: "https://a",
    });
  });

  it("keeps stored values readable when an admin saves another Variable", async () => {
    storePlatformEnvironment({ OPENAI_KEY: "sk-platform" });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", userToken("admin-user"))
      .send({
        variables: { OPENAI_KEY: "[encrypted]", BASE_URL: "https://a" },
        visible: ["BASE_URL"],
      });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: {
        OPENAI_KEY: "sk-platform",
        BASE_URL: "https://a",
      },
    });
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: ["BASE_URL"],
    });
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
