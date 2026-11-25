import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";
import * as YAML from "yaml";

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp([
    () => import("api/node-packages/import-package"),
    () => import("api/node-packages/delete-package"),
    () => import("api/node-packages/export-package"),
    () => import("api/node-packages/list"),
  ]);
});

function packageYaml(nodeId = "echo_node") {
  return YAML.stringify({
    _id: "echo_package",
    version: 2,
    title: "Echo package",
    description: "Echo nodes",
    nodes: {
      [nodeId]: {
        _id: nodeId,
        version: 3,
        title: "Echo",
        execution: "rapid",
        script: "export async function run() { return {}; }",
      },
    },
  });
}

describe("node package administration", () => {
  it("lists package node counts, including packages without nodes", async () => {
    httpDoubles.nodePackages.find.mockReturnValue({
      toArray: async () => [
        { _id: "echo_package", title: "Echo package", version: 2 },
        { _id: "empty_package", title: "Empty package", version: 1 },
      ],
    });
    httpDoubles.nodes.aggregate.mockReturnValue({
      toArray: async () => [
        { _id: "echo_package", count: 3 },
        { _id: "unrelated_package", count: 8 },
      ],
    });

    const response = await context.request
      .get("/api/node-packages")
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { _id: "echo_package", title: "Echo package", version: 2, nodeCount: 3 },
      {
        _id: "empty_package",
        title: "Empty package",
        version: 1,
        nodeCount: 0,
      },
    ]);
  });

  it.each(["owner-user", "engineer-user"])(
    "rejects package listing by %s before reading counts",
    async (user) => {
      const response = await context.request
        .get("/api/node-packages")
        .set("user-token", userToken(user));

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("You aren't admin");
      expect(httpDoubles.nodePackages.find).not.toHaveBeenCalled();
      expect(httpDoubles.nodes.aggregate).not.toHaveBeenCalled();
    }
  );

  it.each(["owner-user", "engineer-user"])(
    "rejects a package import by %s before writing nodes",
    async (user) => {
      const response = await context.request
        .post("/api/node-packages/actions/import-package")
        .set("user-token", userToken(user))
        .send({ yaml: packageYaml() });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("You aren't admin");
      expect(httpDoubles.nodes.bulkWrite).not.toHaveBeenCalled();
    }
  );

  it.each(["owner-user", "engineer-user"])(
    "rejects a package deletion by %s",
    async (user) => {
      const response = await context.request
        .delete("/api/node-packages/echo_package")
        .set("user-token", userToken(user));

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("You aren't admin");
      expect(httpDoubles.nodePackages.deleteOne).not.toHaveBeenCalled();
    }
  );

  it("rejects a package whose node takes the Script Node id", async () => {
    const response = await context.request
      .post("/api/node-packages/actions/import-package")
      .set("user-token", userToken("admin-user"))
      .send({ yaml: packageYaml("script") });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Node id script is reserved");
    expect(httpDoubles.nodes.bulkWrite).not.toHaveBeenCalled();
  });

  it("stamps imported nodes with their package so export finds them", async () => {
    const response = await context.request
      .post("/api/node-packages/actions/import-package")
      .set("user-token", userToken("admin-user"))
      .send({ yaml: packageYaml() });

    expect(response.status).toBe(204);
    const [[bulk]] = httpDoubles.nodes.bulkWrite.mock.calls;
    expect(bulk).toEqual([
      {
        updateOne: {
          filter: { _id: "echo_node" },
          update: {
            $set: expect.objectContaining({
              _id: "echo_node",
              package: "echo_package",
              locked: true,
            }),
          },
          upsert: true,
        },
      },
    ]);
  });
});
