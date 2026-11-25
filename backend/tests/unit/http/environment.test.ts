import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
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

const adminToken = () => userToken("admin-user");

function storeGlobalEnvironment(variables: object, visible?: string[]) {
  const environment = toInstance({ variables, visible }, Environment);
  encrypt(environment);
  redisResponses.set(
    GLOBAL_ENVIRONMENT_KEY,
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

describe("global environment read", () => {
  it("shows Visible Variables and hides Secret Variables", async () => {
    storeGlobalEnvironment(
      { OPENAI_KEY: "sk-user", BASE_URL: "https://api.example", RETRIES: 3 },
      ["BASE_URL"]
    );

    const response = await context.request
      .get("/api/environment")
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
    storeGlobalEnvironment({ OPENAI_KEY: "sk-user", RETRIES: 3 });

    const response = await context.request
      .get("/api/environment")
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

describe("global environment save", () => {
  it("stores which Variables are visible", async () => {
    storeGlobalEnvironment({ OPENAI_KEY: "sk-user" });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({
        variables: { BASE_URL: "https://api.example" },
        visible: ["BASE_URL"],
      });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: {
        OPENAI_KEY: "sk-user",
        BASE_URL: "https://api.example",
      },
    });
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: ["BASE_URL"],
    });
  });

  it("keeps a stored secret when the placeholder pasted from Piper v1 is sent", async () => {
    storeGlobalEnvironment({ OPENAI_KEY: "sk-user" });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({
        variables: { OPENAI_KEY: "[hidden]", MULEROUTER_API_KEY: "[hidden]" },
      });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: { OPENAI_KEY: "sk-user" },
    });
  });

  it("drops the value of a Secret Variable made visible without a new value", async () => {
    storeGlobalEnvironment({ OPENAI_KEY: "sk-user", OTHER: "o" });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({ variables: {}, visible: ["OPENAI_KEY"] });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: { OTHER: "o" },
    });
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: [],
    });
  });

  it("keeps the value of a Secret Variable made visible with a new value", async () => {
    storeGlobalEnvironment({ OPENAI_KEY: "sk-user" });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({ variables: { OPENAI_KEY: "sk-new" }, visible: ["OPENAI_KEY"] });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: { OPENAI_KEY: "sk-new" },
    });
  });

  it("makes a Visible Variable secret again", async () => {
    storeGlobalEnvironment({ BASE_URL: "https://a" }, ["BASE_URL"]);

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({ variables: {}, visible: [] });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: { BASE_URL: "https://a" },
    });
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: [],
    });
  });

  it("doesn't mark a name visible before it has a Variable", async () => {
    storeGlobalEnvironment({ OPENAI_KEY: "sk-user" });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({ variables: {}, visible: ["LATER_KEY"] });

    expect(response.status).toBe(204);
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: [],
    });
  });

  it("only lets string Variables be visible", async () => {
    storeGlobalEnvironment({ RETRIES: 3 });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({ variables: {}, visible: ["RETRIES"] });

    expect(response.status).toBe(204);
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: [],
    });
  });

  it("keeps the stored visibility when the request doesn't send it", async () => {
    storeGlobalEnvironment({ BASE_URL: "https://a" }, ["BASE_URL"]);

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({ variables: { BASE_URL: "https://b" } });

    expect(response.status).toBe(204);
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: ["BASE_URL"],
    });
  });

  it("renames the ArtWorks Variables of an Environment pasted from Piper v1", async () => {
    storeGlobalEnvironment({ OPEN_PAAS_PASSWORD: "stored" });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({
        variables: {
          OPEN_PAAS_USER: "artist",
          OPEN_PAAS_PASSWORD: "[hidden]",
          PAAS_BASE_URL: "https://paas.example",
        },
      });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: {
        ARTWORKS_USER: "artist",
        ARTWORKS_PASSWORD: "stored",
        ARTWORKS_URL: "https://paas.example",
      },
    });
  });
});

describe("global environment variable removal", () => {
  it("removes one variable and keeps the others", async () => {
    storeGlobalEnvironment({
      OPENAI_KEY: "sk-user",
      RETRIES: 3,
    });

    const response = await context.request
      .delete("/api/environment/OPENAI_KEY")
      .set("user-token", adminToken());

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: { RETRIES: 3 },
    });
  });

  it("forgets that a removed Variable was visible", async () => {
    storeGlobalEnvironment({ BASE_URL: "https://a", RETRIES: 3 }, ["BASE_URL"]);

    const response = await context.request
      .delete("/api/environment/BASE_URL")
      .set("user-token", adminToken());

    expect(response.status).toBe(204);
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: [],
    });
  });

  it("does nothing when there is no global environment", async () => {
    const response = await context.request
      .delete("/api/environment/OPENAI_KEY")
      .set("user-token", adminToken());

    expect(response.status).toBe(204);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests", async () => {
    const response = await context.request.delete(
      "/api/environment/OPENAI_KEY"
    );

    expect(response.status).toBe(400);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });
});

describe("global environment variable rename", () => {
  it("moves the stored value to the new name", async () => {
    storeGlobalEnvironment({
      OPENAI_KEY: "sk-user",
      RETRIES: 3,
    });

    const response = await context.request
      .post("/api/environment/OPENAI_KEY/rename")
      .set("user-token", adminToken())
      .send({ name: "OPENAI_API_KEY" });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: {
        OPENAI_API_KEY: "sk-user",
        RETRIES: 3,
      },
    });
  });

  it("keeps a renamed Visible Variable visible", async () => {
    storeGlobalEnvironment({ BASE_URL: "https://a" }, ["BASE_URL"]);

    const response = await context.request
      .post("/api/environment/BASE_URL/rename")
      .set("user-token", adminToken())
      .send({ name: "API_URL" });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: { API_URL: "https://a" },
    });
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: ["API_URL"],
    });
  });

  it("refuses a name another variable already has", async () => {
    storeGlobalEnvironment({
      OPENAI_KEY: "sk-user",
      OPENAI_API_KEY: "sk-other",
    });

    const response = await context.request
      .post("/api/environment/OPENAI_KEY/rename")
      .set("user-token", adminToken())
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
    storeGlobalEnvironment({ OPENAI_KEY: "sk-user" });

    const response = await context.request
      .post("/api/environment/OPENAI_KEY/rename")
      .set("user-token", adminToken())
      .send({ name });

    expect(response.status).toBe(status);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });

  it("answers 404 when the variable isn't stored", async () => {
    storeGlobalEnvironment({ RETRIES: 3 });

    const response = await context.request
      .post("/api/environment/OPENAI_KEY/rename")
      .set("user-token", adminToken())
      .send({ name: "OPENAI_API_KEY" });

    expect(response.status).toBe(404);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });

  it("answers 404 when there is no global environment", async () => {
    const response = await context.request
      .post("/api/environment/OPENAI_KEY/rename")
      .set("user-token", adminToken())
      .send({ name: "OPENAI_API_KEY" });

    expect(response.status).toBe(404);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests", async () => {
    const response = await context.request
      .post("/api/environment/OPENAI_KEY/rename")
      .send({ name: "OPENAI_API_KEY" });

    expect(response.status).toBe(400);
    expect(httpDoubles.redis.set).not.toHaveBeenCalled();
  });
});

describe("global environment by role", () => {
  it("shows Visible values to a user who isn't an admin and hides the secret ones", async () => {
    storeGlobalEnvironment({ OPENAI_KEY: "sk-global", BASE_URL: "https://a" }, [
      "BASE_URL",
    ]);

    const response = await context.request
      .get("/api/environment")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body.variables).toEqual({
      OPENAI_KEY: "[encrypted]",
      BASE_URL: "https://a",
    });
  });

  it("rejects anonymous reads", async () => {
    const response = await context.request.get("/api/environment");

    expect(response.status).toBe(400);
  });

  it.each([
    { method: "put", path: "/api/environment", body: { variables: {} } },
    { method: "delete", path: "/api/environment/OPENAI_KEY", body: undefined },
    {
      method: "post",
      path: "/api/environment/OPENAI_KEY/rename",
      body: { name: "OPENAI_API_KEY" },
    },
  ] as const)(
    "refuses $method $path to a user who isn't an admin",
    async ({ method, path, body }) => {
      storeGlobalEnvironment({ OPENAI_KEY: "sk-global" });

      const response = await context.request[method](path)
        .set("user-token", userToken())
        .send(body);

      expect(response.status).toBe(400);
      expect(httpDoubles.redis.set).not.toHaveBeenCalled();
    }
  );

  it("shows its Visible Variables to an admin and hides the secret ones", async () => {
    storeGlobalEnvironment({ OPENAI_KEY: "sk-global", BASE_URL: "https://a" }, [
      "BASE_URL",
    ]);

    const response = await context.request
      .get("/api/environment")
      .set("user-token", adminToken());

    expect(response.status).toBe(200);
    expect(response.body.variables).toEqual({
      OPENAI_KEY: "[encrypted]",
      BASE_URL: "https://a",
    });
  });

  it("keeps stored values readable when an admin saves another Variable", async () => {
    storeGlobalEnvironment({ OPENAI_KEY: "sk-global" });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({
        variables: { OPENAI_KEY: "[encrypted]", BASE_URL: "https://a" },
        visible: ["BASE_URL"],
      });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: {
        OPENAI_KEY: "sk-global",
        BASE_URL: "https://a",
      },
    });
    expect(writtenVisible()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: ["BASE_URL"],
    });
  });
  it("keeps a stored secret when an admin sends the placeholder pasted from Piper v1", async () => {
    storeGlobalEnvironment({ OPENAI_KEY: "sk-global" });

    const response = await context.request
      .put("/api/environment")
      .set("user-token", adminToken())
      .send({ variables: { OPENAI_KEY: "[hidden]", BASE_URL: "[hidden]" } });

    expect(response.status).toBe(204);
    expect(writtenEnvironments()).toEqual({
      [GLOBAL_ENVIRONMENT_KEY]: { OPENAI_KEY: "sk-global" },
    });
  });
});
