import {
  httpDoubles,
  liveState,
  liveStore,
} from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { httpUserFixture, userToken } from "../../fixtures/http";
import { launchFixture } from "../../fixtures/launch";
import {
  NODE_LOGS,
  NODE_LOGS_DROPPED,
} from "packages/launches/live-state/keys";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LAUNCH_ID = "launch-test";

let context: Awaited<ReturnType<typeof createHttpApp>>;
let scenario: ReturnType<typeof httpScenario>;
let exec: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  scenario = httpScenario();
  scenario.users.set("launcher-user", httpUserFixture("launcher-user"));
  httpDoubles.launches.findOne.mockImplementation(async ({ _id }) =>
    _id === LAUNCH_ID
      ? {
          _id,
          launchedBy: { _id: "launcher-user" },
          project: { _id: "project-http", createdBy: { _id: "owner-user" } },
        }
      : null
  );
  context = await createHttpApp([
    () => import("api/launches/launch-logs"),
    () => import("api/launches/get-launch"),
    () => import("api/launches/nodes/node-status"),
  ]);
});

async function storeLiveLaunch() {
  await liveState.create(launchFixture(), []);
}

// Lines as stored, older formats included (no ts, unknown levels).
async function storeLines(key: string, lines: string[]) {
  await liveStore.exec([{ op: "rPush", key, values: lines }]);
}

function watchStore() {
  exec = vi.spyOn(liveStore, "exec");
}

function line(log: object) {
  return JSON.stringify(log);
}

describe("launch logs HTTP contract", () => {
  it("returns the logs of every node oldest first, tagged with their node", async () => {
    await storeLiveLaunch();
    await storeLines(NODE_LOGS(LAUNCH_ID, "echo_node"), [
      line({ level: "info", message: "echo 1", attempt: 0, ts: 100 }),
      line({ level: "warn", message: "echo 2", attempt: 1, ts: 300 }),
    ]);
    await storeLines(NODE_LOGS(LAUNCH_ID, "sink_node"), [
      line({ level: "error", message: "sink", attempt: 0, ts: 200 }),
    ]);
    await liveStore.exec([
      { op: "incrBy", key: NODE_LOGS_DROPPED(LAUNCH_ID, "sink_node"), by: 7 },
    ]);

    const response = await context.request
      .get(`/api/launches/${LAUNCH_ID}/logs`)
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      available: true,
      logs: [
        {
          node: "echo_node",
          level: "info",
          message: "echo 1",
          attempt: 0,
          ts: 100,
        },
        {
          node: "sink_node",
          level: "error",
          message: "sink",
          attempt: 0,
          ts: 200,
        },
        {
          node: "echo_node",
          level: "warn",
          message: "echo 2",
          attempt: 1,
          ts: 300,
        },
      ],
      dropped: { sink_node: 7 },
    });
  });

  it("returns only the logs of the requested node", async () => {
    await storeLiveLaunch();
    await storeLines(NODE_LOGS(LAUNCH_ID, "echo_node"), [
      line({ level: "info", message: "echo", attempt: 0, ts: 100 }),
    ]);
    await storeLines(NODE_LOGS(LAUNCH_ID, "sink_node"), [
      line({ level: "info", message: "sink", attempt: 0, ts: 200 }),
    ]);

    const response = await context.request
      .get(`/api/launches/${LAUNCH_ID}/logs?node=sink_node`)
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body.logs).toEqual([
      {
        node: "sink_node",
        level: "info",
        message: "sink",
        attempt: 0,
        ts: 200,
      },
    ]);
  });

  it("puts lines stored without a timestamp first, in their node's order", async () => {
    await storeLiveLaunch();
    await storeLines(NODE_LOGS(LAUNCH_ID, "echo_node"), [
      line({ level: "info", message: "old 1", attempt: 0 }),
      line({ level: "info", message: "old 2", attempt: 0 }),
    ]);
    await storeLines(NODE_LOGS(LAUNCH_ID, "sink_node"), [
      line({ level: "info", message: "new", attempt: 0, ts: 100 }),
    ]);

    const response = await context.request
      .get(`/api/launches/${LAUNCH_ID}/logs`)
      .set("user-token", userToken());

    expect(response.body.logs.map(({ message }) => message)).toEqual([
      "old 1",
      "old 2",
      "new",
    ]);
  });

  it("reports logs as unavailable once the live launch has expired", async () => {
    watchStore();

    const response = await context.request
      .get(`/api/launches/${LAUNCH_ID}/logs`)
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ available: false, logs: [], dropped: {} });
    expect(
      exec.mock.calls.flatMap(([commands]) => commands).map(({ op }) => op)
    ).toEqual(["exists"]);
  });

  it.each([
    { kind: "the launching user", user: "launcher-user", status: 200 },
    { kind: "the project owner", user: "owner-user", status: 200 },
    { kind: "an admin", user: "admin-user", status: 200 },
    { kind: "another user", user: "other-user", status: 404 },
  ])("answers $kind with $status", async ({ user, status }) => {
    await storeLiveLaunch();

    const response = await context.request
      .get(`/api/launches/${LAUNCH_ID}/logs`)
      .set("user-token", userToken(user));

    expect(response.status).toBe(status);
  });

  it.each([
    { route: `/api/launches/${LAUNCH_ID}/logs` },
    { route: `/api/launches/${LAUNCH_ID}` },
    { route: `/api/launches/${LAUNCH_ID}/echo_node/status` },
  ])("hides $route from another user", async ({ route }) => {
    await storeLiveLaunch();
    await liveState.nodeStarted(LAUNCH_ID, "echo_node");
    watchStore();

    const response = await context.request
      .get(route)
      .set("user-token", userToken("other-user"));

    expect(response.status).toBe(404);
    expect(exec).not.toHaveBeenCalled();
  });

  it.each([
    { route: `/api/launches/${LAUNCH_ID}/logs` },
    { route: `/api/launches/${LAUNCH_ID}/echo_node/status` },
  ])("rejects an anonymous request to $route", async ({ route }) => {
    const response = await context.request.get(route);

    expect(response.status).toBe(400);
    expect(httpDoubles.launches.findOne).not.toHaveBeenCalled();
  });

  it("answers a missing launch with 404", async () => {
    const response = await context.request
      .get("/api/launches/missing/logs")
      .set("user-token", userToken());

    expect(response.status).toBe(404);
  });
});
