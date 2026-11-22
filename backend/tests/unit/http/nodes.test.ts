import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp([
    () => import("api/nodes/list"),
    () => import("api/nodes/get-node"),
    () => import("api/nodes/publish-node"),
  ]);
});

function catalogNode(sign: string) {
  return {
    _id: "echo_node",
    version: 1,
    title: "Echo",
    execution: "rapid",
    script: "export async function run() { return {}; }",
    sign,
    catalog: {
      _id: "echo_catalog",
      version: 7,
      category: { _id: "general", title: "General" },
      package: "echo_package",
    },
  };
}

describe("node catalog reads", () => {
  it("hides the catalog metadata of a node", async () => {
    httpDoubles.nodes.findOne.mockResolvedValue({
      _id: "echo_node",
      title: "Echo",
      catalog: { _id: "echo_node", version: 1 },
    });

    const response = await context.request.get("/api/nodes/echo_node");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ _id: "echo_node", title: "Echo" });
  });

  it("returns 404 for a missing node", async () => {
    httpDoubles.nodes.findOne.mockResolvedValue(null);

    const response = await context.request.get("/api/nodes/missing");

    expect(response.status).toBe(404);
  });
});

describe("Script Node in the catalog", () => {
  it("is listed first in the catalog without any package installed", async () => {
    httpDoubles.nodesCursor.toArray.mockResolvedValue([
      { _id: "echo_node", title: "Echo" },
    ]);

    const response = await context.request.get("/api/nodes");

    expect(response.status).toBe(200);
    expect(response.body.map(({ _id }) => _id)).toEqual([
      "script",
      "echo_node",
    ]);
  });

  it("is left out of a search its title doesn't match", async () => {
    httpDoubles.nodesCursor.toArray.mockResolvedValue([]);

    const response = await context.request.get("/api/nodes?search=en");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("is placed with no inputs or outputs, an inline script and no sign", async () => {
    const response = await context.request.get("/api/nodes/script");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      _id: "script",
      source: "script",
      inputs: {},
      outputs: {},
    });
    expect(response.body.script).toContain("export async function run");
    expect(response.body.sign).toBeUndefined();
    expect(httpDoubles.nodes.findOne).not.toHaveBeenCalled();
  });
});

describe("node catalog publishing", () => {
  it("rejects a forged sign from a regular user before writing", async () => {
    const response = await context.request
      .post("/api/nodes")
      .set("user-token", userToken("owner-user"))
      .send(catalogNode("forged"));

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Wrong sign for echo_catalog node");
    expect(httpDoubles.nodes.updateOne).not.toHaveBeenCalled();
  });

  it("rejects publishing a node under the Script Node id", async () => {
    const node = catalogNode("forged");
    node.catalog._id = "script";

    const response = await context.request
      .post("/api/nodes")
      .set("user-token", userToken("engineer-user"))
      .send(node);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Node id script is reserved");
    expect(httpDoubles.nodes.updateOne).not.toHaveBeenCalled();
  });

  it("re-signs a node published by an engineer", async () => {
    const response = await context.request
      .post("/api/nodes")
      .set("user-token", userToken("engineer-user"))
      .send(catalogNode("forged"));

    expect(response.status).toBe(204);
    const [[filter, update]] = httpDoubles.nodes.updateOne.mock.calls;
    expect(filter).toEqual({ _id: "echo_catalog" });
    expect(update.$set).toMatchObject({
      _id: "echo_catalog",
      version: 7,
      package: "echo_package",
      source: "catalog",
    });
    expect(update.$set.sign).toMatch(/^[0-9a-f]{64}$/);
  });
});
