import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { HTTP_TEST_TIME, userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";

let scenario: ReturnType<typeof httpScenario>;
let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  scenario = httpScenario();
  context = await createHttpApp([
    () => import("api/projects/launch-project"),
    () => import("api/launches/interrupt-launch"),
  ]);
});

describe("project launch HTTP contract", () => {
  it("merges stored launch inputs with the request and starts the real launch logic", async () => {
    const response = await context.request
      .post("/api/projects/project-http/launch")
      .set("user-token", userToken())
      .send({ inputs: { text: "override" } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      _id: "http-generated-id",
      launchedBy: { _id: "owner-user" },
      launchedAt: HTTP_TEST_TIME.toISOString(),
      launchRequest: { inputs: { enabled: false, count: 0, text: "override" } },
      options: { notify: true },
    });
    expect(response.body).not.toHaveProperty("pipeline");
    expect(httpDoubles.launches.insertOne).toHaveBeenCalledOnce();
    expect(httpDoubles.redis.setEx).toHaveBeenCalledWith(
      "launch:http-generated-id:nodes:echo_node:inputs:count",
      expect.any(Number),
      "0"
    );
    expect(httpDoubles.redis.setEx).toHaveBeenCalledWith(
      "launch:http-generated-id:nodes:echo_node:inputs:text",
      expect.any(Number),
      "override"
    );
    expect(httpDoubles.plans.rapid).toHaveBeenCalledExactlyOnceWith(
      { launch: "http-generated-id", node: "echo_node" },
      {}
    );
    expect(httpDoubles.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["admin-user", "private"],
    ["other-user", "public"],
  ])("lets %s launch a %s project", async (user, visibility) => {
    scenario.project.visibility = visibility;

    const response = await context.request
      .post("/api/projects/project-http/launch")
      .set("user-token", userToken(user))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.launchedBy._id).toBe(user);
    expect(httpDoubles.launches.insertOne).toHaveBeenCalledOnce();
  });

  it("hides a private project from a non-owner without launching it", async () => {
    const response = await context.request
      .post("/api/projects/project-http/launch")
      .set("user-token", userToken("other-user"))
      .send({});

    expect(response.status).toBe(404);
    expect(httpDoubles.launches.insertOne).not.toHaveBeenCalled();
    expect(httpDoubles.plans.rapid).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "an anonymous", headers: {}, status: 400 },
    {
      kind: "an invalid token",
      headers: { "user-token": "invalid" },
      status: 401,
    },
  ])("rejects $kind launch request", async ({ headers, status }) => {
    const response = await context.request
      .post("/api/projects/project-http/launch")
      .set(headers)
      .send({});

    expect(response.status).toBe(status);
    expect(httpDoubles.projects.findOne).not.toHaveBeenCalled();
    expect(httpDoubles.launches.insertOne).not.toHaveBeenCalled();
    expect(httpDoubles.plans.rapid).not.toHaveBeenCalled();
  });

  it("rejects a launch for a missing project", async () => {
    httpDoubles.projects.findOne.mockResolvedValue(null);

    const response = await context.request
      .post("/api/projects/missing/launch")
      .set("user-token", userToken())
      .send({});

    expect(response.status).toBe(404);
    expect(httpDoubles.launches.insertOne).not.toHaveBeenCalled();
  });

  it.each([{ inputs: null }, { nodes: null }])(
    "validates the merged launch request %j",
    async (body) => {
      const response = await context.request
        .post("/api/projects/project-http/launch")
        .set("user-token", userToken())
        .send(body);

      expect(response.status).toBe(400);
      expect(httpDoubles.launches.insertOne).not.toHaveBeenCalled();
      expect(httpDoubles.redis.setEx).not.toHaveBeenCalled();
    }
  );

  it("maps launch persistence failures to 500 without scheduling nodes", async () => {
    const failure = new Error("database offline");
    httpDoubles.launches.insertOne.mockRejectedValue(failure);

    const response = await context.request
      .post("/api/projects/project-http/launch")
      .set("user-token", userToken())
      .send({});

    expect(response.status).toBe(500);
    expect(httpDoubles.captureException).toHaveBeenCalledWith(failure);
    expect(httpDoubles.plans.rapid).not.toHaveBeenCalled();
  });
});

describe("launch interruption contract", () => {
  it("sets an expiring interruption marker for an authenticated request", async () => {
    httpDoubles.redis.EXISTS.mockResolvedValue(1);

    const response = await context.request
      .post("/api/launches/launch-http/interrupt")
      .set("user-token", userToken("other-user"));

    expect(response.status).toBe(204);
    expect(httpDoubles.redis.EXISTS).toHaveBeenCalledExactlyOnceWith(
      "launch:launch-http"
    );
    expect(httpDoubles.redis.setEx).toHaveBeenCalledExactlyOnceWith(
      "launch:launch-http:interrupted",
      604800,
      HTTP_TEST_TIME.toISOString()
    );
  });

  it("rejects interruption of a missing launch", async () => {
    const response = await context.request
      .post("/api/launches/missing/interrupt")
      .set("user-token", userToken());

    expect(response.status).toBe(404);
    expect(httpDoubles.redis.setEx).not.toHaveBeenCalled();
  });

  it("rejects anonymous interruption before reading Redis", async () => {
    const response = await context.request.post(
      "/api/launches/launch-http/interrupt"
    );

    expect(response.status).toBe(400);
    expect(httpDoubles.redis.EXISTS).not.toHaveBeenCalled();
  });
});
