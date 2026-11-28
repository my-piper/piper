import {
  httpDoubles,
  liveState,
  liveStore,
} from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { HTTP_TEST_TIME, userToken } from "../../fixtures/http";
import { launchFixture } from "../../fixtures/launch";
import {
  LAUNCH_EXPIRED,
  LAUNCH_INTERRUPTED,
} from "packages/launches/live-state/keys";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
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
    const launch = await liveState.get("http-generated-id");
    expect(
      await liveState.inputs(
        launch._id,
        "echo_node",
        launch.pipeline.nodes.get("echo_node").inputs
      )
    ).toMatchObject({ count: 0, text: "override" });
    expect(httpDoubles.plans.rapid).toHaveBeenCalledExactlyOnceWith(
      { launch: "http-generated-id", node: "echo_node" },
      {}
    );
    expect(httpDoubles.execute).not.toHaveBeenCalled();
  });

  it("lets an admin launch another user's project", async () => {
    const user = "admin-user";

    const response = await context.request
      .post("/api/projects/project-http/launch")
      .set("user-token", userToken(user))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.launchedBy._id).toBe(user);
    expect(httpDoubles.launches.insertOne).toHaveBeenCalledOnce();
  });

  it("hides a project from a non-owner without launching it", async () => {
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
      expect(liveStore.keys()).toEqual([]);
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

async function storeLaunch() {
  await liveState.create(
    Object.assign(launchFixture(), { _id: "launch-http" }),
    []
  );
}

describe("launch interruption contract", () => {
  beforeEach(() => {
    httpDoubles.launches.findOne.mockImplementation(async ({ _id }) =>
      _id === "launch-http"
        ? { _id, launchedBy: { _id: "owner-user" }, project: {} }
        : null
    );
  });

  it("sets an expiring interruption marker for the launching user", async () => {
    await storeLaunch();

    const response = await context.request
      .post("/api/launches/launch-http/interrupt")
      .set("user-token", userToken());

    expect(response.status).toBe(204);
    expect(await liveState.interruptedAt("launch-http")).toEqual(
      HTTP_TEST_TIME
    );
    expect(liveStore.ttl(LAUNCH_INTERRUPTED("launch-http"))).toBe(
      LAUNCH_EXPIRED
    );
    // the API server sends no streams: a worker records the interrupted run
    expect(httpDoubles.plans.interrupted).toHaveBeenCalledExactlyOnceWith({
      launch: "launch-http",
    });
  });

  it("interrupts child launches recursively", async () => {
    await storeLaunch();
    httpDoubles.launches.distinct
      .mockResolvedValueOnce(["child-1"])
      .mockResolvedValueOnce(["grandchild-1"]);

    const response = await context.request
      .post("/api/launches/launch-http/interrupt")
      .set("user-token", userToken());

    expect(response.status).toBe(204);
    expect(httpDoubles.launches.distinct).toHaveBeenCalledWith("_id", {
      parent: "child-1",
    });
    for (const launch of ["launch-http", "child-1", "grandchild-1"]) {
      expect(await liveState.interruptedAt(launch)).toEqual(HTTP_TEST_TIME);
      expect(httpDoubles.plans.interrupted).toHaveBeenCalledWith({ launch });
    }
  });

  it("rejects interruption of a missing launch", async () => {
    const response = await context.request
      .post("/api/launches/missing/interrupt")
      .set("user-token", userToken());

    expect(response.status).toBe(404);
    expect(await liveState.interruptedAt("missing")).toBeNull();
  });

  it("rejects anonymous interruption before reading Redis", async () => {
    const exec = vi.spyOn(liveStore, "exec");

    const response = await context.request.post(
      "/api/launches/launch-http/interrupt"
    );

    expect(response.status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });
});
