import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";

let scenario: ReturnType<typeof httpScenario>;
let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  scenario = httpScenario();
  context = await createHttpApp([
    () => import("api/projects/check-node-updates"),
  ]);
});

describe("project node updates", () => {
  it("hides a private project from another user as not found", async () => {
    const response = await context.request
      .get("/api/projects/project-http/check-node-updates")
      .set("user-token", userToken("other-user"));

    expect(response.status).toBe(404);
    expect(httpDoubles.nodes.findOne).not.toHaveBeenCalled();
  });

  it("reports a newer catalog version of a pipeline node", async () => {
    Object.assign(scenario.project.pipeline.nodes.echo_node, {
      source: "catalog",
      version: 1,
    });
    httpDoubles.nodes.findOne.mockResolvedValue({
      ...scenario.project.pipeline.nodes.echo_node,
      title: "Echo v2",
      version: 2,
    });

    const response = await context.request
      .get("/api/projects/project-http/check-node-updates")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body.updates.echo_node.updated).toMatchObject({
      version: 2,
      title: "Echo",
      source: "catalog",
    });
    expect(httpDoubles.nodes.findOne).toHaveBeenCalledExactlyOnceWith({
      _id: "echo_node",
      version: { $gt: 1 },
    });
  });

  it("keeps the isolation mark the pipeline set on the node", async () => {
    Object.assign(scenario.project.pipeline.nodes.echo_node, {
      source: "catalog",
      version: 1,
    });
    httpDoubles.nodes.findOne.mockResolvedValue({
      ...scenario.project.pipeline.nodes.echo_node,
      version: 2,
      isolated: true,
    });

    const response = await context.request
      .get("/api/projects/project-http/check-node-updates")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    const update = response.body.updates.echo_node;
    expect(update.updated.version).toBe(2);
    expect(update.updated).not.toHaveProperty("isolated");
    expect(update.changes).not.toHaveProperty("isolated");
  });

  it("fails instead of reporting an empty update when the catalog lookup fails", async () => {
    Object.assign(scenario.project.pipeline.nodes.echo_node, {
      source: "catalog",
      version: 1,
    });
    httpDoubles.nodes.findOne.mockRejectedValue(new Error("mongo down"));

    const response = await context.request
      .get("/api/projects/project-http/check-node-updates")
      .set("user-token", userToken());

    expect(response.status).toBe(500);
  });
});
