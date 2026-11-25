import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { HTTP_TEST_TIME, userToken } from "../../fixtures/http";
import { pipelineFixture, launchRequestFixture } from "../../fixtures/pipeline";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { diff } from "jsondiffpatch/with-text-diffs";
import { Environment } from "models/environment";
import { decrypt, encrypt } from "packages/environment/crypt-environment";
import { beforeEach, describe, expect, it } from "vitest";

let scenario: ReturnType<typeof httpScenario>;
let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  scenario = httpScenario();
  context = await createHttpApp([
    () => import("api/projects/list"),
    () => import("api/projects/tags/list-available-tags"),
    () => import("api/projects/groups/list-groups"),
    () => import("api/projects/groups/list-group-counts"),
    () => import("api/projects/groups/rename-group"),
    () => import("api/projects/get-project"),
    () => import("api/projects/add-project"),
    () => import("api/projects/update-project"),
    () => import("api/projects/update-project-settings"),
    () => import("api/projects/delete-project"),
    () => import("api/projects/patch-project"),
  ]);
});

describe("project read and serialization contracts", () => {
  it("serializes model maps/dates, masks environment strings, and drops unexposed fields", async () => {
    Object.assign(scenario.project, {
      internal: "private",
      environment: {
        scope: { key: "pipeline" },
        variables: { secret: "ciphertext", enabled: false, count: 0 },
      },
    });

    const response = await context.request
      .get("/api/projects/project-http")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(response.body.pipeline).toEqual(pipelineFixture());
    expect(response.body.launchRequest).toEqual(launchRequestFixture());
    expect(response.body.environment.variables).toEqual({
      secret: "[encrypted]",
      enabled: false,
      count: 0,
    });
    expect(response.body).not.toHaveProperty("internal");
    expect(httpDoubles.projects.findOne).toHaveBeenCalledExactlyOnceWith({
      $or: [{ _id: "project-http" }, { slug: "project-http" }],
    });
  });

  it.each([
    ["owner-user", "private"],
    ["admin-user", "private"],
    ["other-user", "public"],
  ])("lets %s read a %s project", async (user, visibility) => {
    scenario.project.visibility = visibility;

    const response = await context.request
      .get("/api/projects/project-http")
      .set("user-token", userToken(user));

    expect(response.status).toBe(200);
    expect(response.body.pipeline).toEqual(pipelineFixture());
  });

  it.each(["other-user", "engineer-user"])(
    "hides a private project from %s as not found",
    async (user) => {
      const response = await context.request
        .get("/api/projects/project-http")
        .set("user-token", userToken(user));

      expect(response.status).toBe(404);
      expect(response.text).toBe("Not found");
    }
  );

  it("rejects an anonymous read before accessing project storage", async () => {
    const response = await context.request.get("/api/projects/project-http");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You aren't logged");
    expect(httpDoubles.projects.findOne).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing project", async () => {
    httpDoubles.projects.findOne.mockResolvedValue(null);

    const response = await context.request
      .get("/api/projects/missing")
      .set("user-token", userToken());

    expect(response.status).toBe(404);
    expect(response.text).toBe("Not found");
  });
});

describe("project creation and validation", () => {
  it("assigns ownership and private visibility and returns summary fields", async () => {
    const body = {
      title: "New project",
      pipeline: pipelineFixture(),
      launchRequest: launchRequestFixture(),
      _id: "client-id",
      createdBy: { _id: "other-user" },
      visibility: "public",
    };
    let persisted: object;
    // MongoDB consumes this document before the route trims the response object.
    httpDoubles.projects.insertOne.mockImplementation(async (document) => {
      persisted = structuredClone(document);
    });

    const response = await context.request
      .post("/api/projects")
      .set("user-token", userToken())
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      _id: "http-generated-id",
      title: "New project",
      visibility: "private",
      createdBy: { _id: "owner-user" },
      createdAt: HTTP_TEST_TIME.toISOString(),
    });
    expect(response.body).not.toHaveProperty("pipeline");
    expect(response.body).not.toHaveProperty("launchRequest");
    expect(httpDoubles.projects.insertOne).toHaveBeenCalledOnce();
    expect(persisted).toEqual(
      expect.objectContaining({
        pipeline: pipelineFixture(),
        launchRequest: launchRequestFixture(),
        createdBy: { _id: "owner-user" },
        visibility: "private",
        createdAt: HTTP_TEST_TIME,
      })
    );
  });

  it("copies pipeline tags to the project", async () => {
    const pipeline = { ...pipelineFixture(), tags: ["image", "video"] };

    const response = await context.request
      .post("/api/projects")
      .set("user-token", userToken())
      .send({ title: "Tagged", pipeline });

    expect(response.status).toBe(200);
    expect(response.body.tags).toEqual(["image", "video"]);
    expect(httpDoubles.projects.insertOne.mock.calls[0][0].tags).toEqual([
      "image",
      "video",
    ]);
  });

  it("rejects an invalid nested pipeline using the production validator", async () => {
    const pipeline = pipelineFixture();
    pipeline.inputs.enabled.type = "unknown";

    const response = await context.request
      .post("/api/projects")
      .set("user-token", userToken())
      .send({ title: "Invalid", pipeline });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Project schema invalid");
    expect(response.body.details.length).toBeGreaterThan(0);
    expect(httpDoubles.projects.insertOne).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before inserting a project", async () => {
    const response = await context.request
      .post("/api/projects")
      .set("user-token", userToken())
      .set("Content-Type", "application/json")
      .send('{"title":');

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.insertOne).not.toHaveBeenCalled();
  });

  it("rejects anonymous project creation", async () => {
    const response = await context.request
      .post("/api/projects")
      .send({ title: "Project" });

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.insertOne).not.toHaveBeenCalled();
  });
});

describe("project ownership and admin permissions", () => {
  it.each(["owner-user", "admin-user"])(
    "allows %s to update a project",
    async (user) => {
      const response = await context.request
        .post("/api/projects/project-http")
        .set("user-token", userToken(user))
        .send({
          visibility: "public",
          slug: "published",
          order: 2,
          title: "ignored",
          createdBy: { _id: "client-user" },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        visibility: "public",
        slug: "published",
        order: 2,
        updatedAt: HTTP_TEST_TIME.toISOString(),
        updatedBy: { _id: user },
      });
      expect(httpDoubles.projects.updateOne).toHaveBeenCalledExactlyOnceWith(
        { _id: "project-http" },
        {
          $set: {
            visibility: "public",
            slug: "published",
            order: 2,
            updatedAt: HTTP_TEST_TIME,
            updatedBy: { _id: user },
          },
        }
      );
    }
  );

  it.each(["other-user", "engineer-user"])(
    "rejects project updates by %s",
    async (user) => {
      const response = await context.request
        .post("/api/projects/project-http")
        .set("user-token", userToken(user))
        .send({ visibility: "public" });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("You aren't admin");
      expect(httpDoubles.projects.updateOne).not.toHaveBeenCalled();
    }
  );

  it.each([{ visibility: "invalid" }, { slug: "missing-visibility" }])(
    "rejects invalid project settings %j",
    async (body) => {
      const response = await context.request
        .post("/api/projects/project-http")
        .set("user-token", userToken())
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Pipeline schema invalid");
      expect(httpDoubles.projects.updateOne).not.toHaveBeenCalled();
    }
  );

  it.each(["owner-user", "admin-user"])(
    "allows %s to delete a project",
    async (user) => {
      const response = await context.request
        .delete("/api/projects/project-http")
        .set("user-token", userToken(user));

      expect(response.status).toBe(204);
      expect(response.text).toBe("");
      expect(httpDoubles.projects.deleteOne).toHaveBeenCalledExactlyOnceWith({
        _id: "project-http",
      });
    }
  );

  it.each(["other-user", "engineer-user"])(
    "rejects project deletion by %s",
    async (user) => {
      const response = await context.request
        .delete("/api/projects/project-http")
        .set("user-token", userToken(user));

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("You aren't admin");
      expect(httpDoubles.projects.deleteOne).not.toHaveBeenCalled();
    }
  );

  it("returns 404 when deleting an absent project", async () => {
    httpDoubles.projects.findOne.mockResolvedValue(null);

    const response = await context.request
      .delete("/api/projects/missing")
      .set("user-token", userToken());

    expect(response.status).toBe(404);
    expect(httpDoubles.projects.deleteOne).not.toHaveBeenCalled();
  });
});

describe("project listing", () => {
  it("filters owned and public projects by case-insensitive title search", async () => {
    const response = await context.request
      .get("/api/projects")
      .query({ search: "Image" })
      .set("user-token", userToken("owner-user"));

    expect(response.status).toBe(200);
    expect(httpDoubles.projects.find.mock.calls[0][0]).toEqual({
      title: { $regex: /Image/i },
      $or: [{ "createdBy._id": "owner-user" }, { visibility: "public" }],
    });
  });

  it("treats search text literally", async () => {
    const response = await context.request
      .get("/api/projects")
      .query({ search: "a(b" })
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(httpDoubles.projects.find.mock.calls[0][0]).toEqual({
      title: { $regex: /a\(b/i },
    });
  });

  it("filters projects having all selected tags", async () => {
    const response = await context.request
      .get("/api/projects")
      .query({ tags: ["image", "video"] })
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(httpDoubles.projects.find.mock.calls[0][0]).toEqual({
      tags: { $all: ["image", "video"] },
    });
  });

  it("accepts a single tag", async () => {
    const response = await context.request
      .get("/api/projects")
      .query({ tags: "image" })
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(httpDoubles.projects.find.mock.calls[0][0]).toEqual({
      tags: { $all: ["image"] },
    });
  });

  it("rejects non-string tags", async () => {
    const response = await context.request
      .get("/api/projects?tags[$ne]=image")
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.find).not.toHaveBeenCalled();
  });
});

describe("project groups", () => {
  it("filters projects by group", async () => {
    const response = await context.request
      .get("/api/projects")
      .query({ group: "Marketing" })
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(httpDoubles.projects.find.mock.calls[0][0]).toEqual({
      group: "Marketing",
    });
  });

  it("filters projects outside any group", async () => {
    const response = await context.request
      .get("/api/projects")
      .query({ ungrouped: "true" })
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(httpDoubles.projects.find.mock.calls[0][0]).toEqual({
      group: null,
    });
  });

  it("rejects a non-boolean ungrouped flag", async () => {
    const response = await context.request
      .get("/api/projects")
      .query({ ungrouped: "yes" })
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.find).not.toHaveBeenCalled();
  });

  it("rejects a non-string group", async () => {
    const response = await context.request
      .get("/api/projects?group[$ne]=Marketing")
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.find).not.toHaveBeenCalled();
  });

  it("lists sorted groups of owned and public projects", async () => {
    httpDoubles.projects.distinct.mockResolvedValue(["Sales", null, "Ads"]);

    const response = await context.request
      .get("/api/projects/groups")
      .set("user-token", userToken("owner-user"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(["Ads", "Sales"]);
    expect(httpDoubles.projects.distinct).toHaveBeenCalledWith("group", {
      $or: [{ "createdBy._id": "owner-user" }, { visibility: "public" }],
    });
  });

  it("counts projects per group of owned and public projects", async () => {
    httpDoubles.projectsAggregation.toArray.mockResolvedValue([
      { group: "Ads", count: 2 },
      { group: "Sales", count: 1 },
    ]);

    const response = await context.request
      .get("/api/projects/groups/counts")
      .set("user-token", userToken("owner-user"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { group: "Ads", count: 2 },
      { group: "Sales", count: 1 },
    ]);
    expect(httpDoubles.projects.aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        group: { $nin: [null, ""] },
        $or: [{ "createdBy._id": "owner-user" }, { visibility: "public" }],
      },
    });
  });

  it("lists groups of all projects for admins", async () => {
    const response = await context.request
      .get("/api/projects/groups")
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(httpDoubles.projects.distinct).toHaveBeenCalledWith("group", {});
  });

  it("renames a folder with its subfolders in owned projects", async () => {
    httpDoubles.projectsCursor.toArray.mockResolvedValue([
      { _id: "a", group: "Marketing" },
      { _id: "b", group: "Marketing / Video" },
    ]);

    const response = await context.request
      .post("/api/projects/groups/rename")
      .set("user-token", userToken("owner-user"))
      .send({ from: "Marketing", to: " Sales/Ads " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ renamed: 2 });
    const [filter] = httpDoubles.projects.find.mock.calls[0];
    expect(filter["createdBy._id"]).toBe("owner-user");
    expect(filter.group.$regex.test("Marketing/Video")).toBe(true);
    expect(filter.group.$regex.test("Marketing2")).toBe(false);
    expect(httpDoubles.projects.bulkWrite).toHaveBeenCalledExactlyOnceWith([
      {
        updateOne: {
          filter: { _id: "a" },
          update: { $set: { group: "Sales/Ads" } },
        },
      },
      {
        updateOne: {
          filter: { _id: "b" },
          update: { $set: { group: "Sales/Ads/Video" } },
        },
      },
    ]);
  });

  it("renames folders of all projects for admins", async () => {
    const response = await context.request
      .post("/api/projects/groups/rename")
      .set("user-token", userToken("admin-user"))
      .send({ from: "Marketing", to: "Sales" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ renamed: 0 });
    expect(httpDoubles.projects.find.mock.calls[0][0]).not.toHaveProperty(
      "createdBy._id"
    );
    expect(httpDoubles.projects.bulkWrite).not.toHaveBeenCalled();
  });

  it.each([
    { from: "Marketing", to: " / " },
    { from: "Marketing", to: "Marketing/Video" },
    { from: "Marketing" },
    { from: { $ne: "" }, to: "Sales" },
  ])("rejects an invalid rename %j", async (body) => {
    const response = await context.request
      .post("/api/projects/groups/rename")
      .set("user-token", userToken("owner-user"))
      .send(body);

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.bulkWrite).not.toHaveBeenCalled();
  });

  it("rejects a rename making a group too long", async () => {
    httpDoubles.projectsCursor.toArray.mockResolvedValue([
      { _id: "a", group: `Marketing/${"x".repeat(90)}` },
    ]);

    const response = await context.request
      .post("/api/projects/groups/rename")
      .set("user-token", userToken("owner-user"))
      .send({ from: "Marketing", to: "y".repeat(20) });

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.bulkWrite).not.toHaveBeenCalled();
  });
});

describe("project settings", () => {
  it.each(["owner-user", "admin-user"])(
    "allows %s to move a project to a trimmed group",
    async (user) => {
      const response = await context.request
        .post("/api/projects/project-http/settings")
        .set("user-token", userToken(user))
        .send({ group: "  Marketing ", visibility: "public" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        group: "Marketing",
        updatedAt: HTTP_TEST_TIME.toISOString(),
        updatedBy: { _id: user },
      });
      expect(httpDoubles.projects.updateOne).toHaveBeenCalledExactlyOnceWith(
        { _id: "project-http" },
        {
          $set: {
            group: "Marketing",
            updatedAt: HTTP_TEST_TIME,
            updatedBy: { _id: user },
          },
        }
      );
    }
  );

  it.each([{ group: "" }, { group: "   " }, { group: null }, {}])(
    "removes a project from its group on %j",
    async (body) => {
      const response = await context.request
        .post("/api/projects/project-http/settings")
        .set("user-token", userToken())
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body.group).toBeNull();
      expect(httpDoubles.projects.updateOne.mock.calls[0][1]).toEqual({
        $set: expect.objectContaining({ group: null }),
      });
    }
  );

  it.each([{ group: 42 }, { group: "x".repeat(101) }])(
    "rejects invalid settings %j",
    async (body) => {
      const response = await context.request
        .post("/api/projects/project-http/settings")
        .set("user-token", userToken())
        .send(body);

      expect(response.status).toBe(400);
      expect(httpDoubles.projects.updateOne).not.toHaveBeenCalled();
    }
  );

  it("rejects settings updates by other users", async () => {
    const response = await context.request
      .post("/api/projects/project-http/settings")
      .set("user-token", userToken("other-user"))
      .send({ group: "Marketing" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You aren't admin");
    expect(httpDoubles.projects.updateOne).not.toHaveBeenCalled();
  });
});

describe("available project tags", () => {
  it("lists sorted tags of owned and public projects", async () => {
    httpDoubles.projects.distinct.mockResolvedValue(["video", "", "image"]);

    const response = await context.request
      .get("/api/projects/tags/available")
      .set("user-token", userToken("owner-user"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(["image", "video"]);
    expect(httpDoubles.projects.distinct).toHaveBeenCalledWith("tags", {
      $or: [{ "createdBy._id": "owner-user" }, { visibility: "public" }],
    });
  });

  it("lists tags of all projects for admins", async () => {
    const response = await context.request
      .get("/api/projects/tags/available")
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(httpDoubles.projects.distinct).toHaveBeenCalledWith("tags", {});
  });
});

describe("Node in a pipeline patch", () => {
  function addedNodePatch(node: object) {
    const { pipeline } = scenario.project;
    return diff(pipeline, {
      ...pipeline,
      nodes: { ...pipeline.nodes, script_1: node },
    });
  }

  async function patchAsRegularUser(node: object) {
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ pipeline: addedNodePatch(node) });

    expect(response.status).toBe(200);
    const [, { $set }] = httpDoubles.projects.updateOne.mock.calls[0];
    return $set.pipeline.nodes.script_1;
  }

  it("keeps a Script Node's Environment and isolation mark and drops a sign", async () => {
    const script =
      'export async function run({ inputs }) { return { __type: "next", outputs: { b: inputs.a } }; }';

    const written = await patchAsRegularUser({
      _id: "script",
      title: "Script",
      source: "script",
      execution: "regular",
      arrange: { x: 10, y: 10 },
      script,
      sign: "stale",
      isolated: true,
      environment: { OPENAI_KEY: { type: "string", scope: "global" } },
      inputs: { a: { type: "string", title: "A" } },
      outputs: { b: { type: "string", title: "B" } },
    });

    expect(written).toMatchObject({
      script,
      isolated: true,
      environment: { OPENAI_KEY: { type: "string", scope: "global" } },
      inputs: { a: { type: "string", title: "A" } },
      outputs: { b: { type: "string", title: "B" } },
    });
    expect(written.sign).toBeUndefined();
  });

  it("lets a Script Node's script point at published code", async () => {
    const script = "registry:echo_package@2/echo_node/script.js";

    const written = await patchAsRegularUser({
      _id: "script",
      title: "Script",
      source: "script",
      execution: "regular",
      arrange: { x: 10, y: 10 },
      script,
      inputs: {},
      outputs: {},
    });

    expect(written.script).toBe(script);
  });

  it("lets a regular user edit the script of a catalog node", async () => {
    const script = "export async function run() {}";

    const written = await patchAsRegularUser({
      _id: "echo_node",
      title: "Echo",
      source: "catalog",
      execution: "rapid",
      arrange: { x: 10, y: 10 },
      script,
      inputs: {},
      outputs: {},
    });

    expect(written.script).toBe(script);
  });
});

describe("project environment patch", () => {
  function storeProjectEnvironment(variables: object, visible?: string[]) {
    const environment = toInstance({ variables, visible }, Environment);
    encrypt(environment);
    Object.assign(scenario.project, { environment: toPlain(environment) });
  }

  /** The Project Environment written to MongoDB, decrypted. */
  function writtenEnvironment() {
    const [, { $set }] = httpDoubles.projects.updateOne.mock.calls[0];
    const environment = toInstance($set.environment, Environment);
    decrypt(environment);
    return {
      variables: Object.fromEntries(environment.variables),
      visible: environment.visible,
    };
  }

  it.each([
    {
      name: "drops the value of a Secret Variable made visible without a new value",
      sent: "[encrypted]",
      stored: undefined,
      visible: [],
    },
    {
      name: "keeps the new value of a Secret Variable made visible",
      sent: "sk-new",
      stored: "sk-new",
      visible: ["OPENAI_KEY"],
    },
  ])("$name", async ({ sent, stored, visible }) => {
    storeProjectEnvironment({ OPENAI_KEY: "sk-project", RETRIES: 3 });
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });
    const delta = diff(
      { variables: { OPENAI_KEY: "[encrypted]", RETRIES: 3 } },
      { variables: { OPENAI_KEY: sent, RETRIES: 3 }, visible: ["OPENAI_KEY"] }
    );

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ environment: delta });

    expect(response.status).toBe(200);
    expect(writtenEnvironment()).toEqual({
      variables: { OPENAI_KEY: stored, RETRIES: 3 },
      visible,
    });
  });

  it("doesn't reveal a secret edited in place by a text delta", async () => {
    const secret = `sk-project-${"a".repeat(70)}`;
    storeProjectEnvironment({ OPENAI_KEY: secret });
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });
    const delta = {
      variables: { OPENAI_KEY: ["@@ -0,0 +1,1 @@\n+x\n", 0, 2] },
      visible: [["OPENAI_KEY"]],
    };

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ environment: delta });

    expect(response.status).toBe(200);
    expect(writtenEnvironment().variables.OPENAI_KEY).not.toContain(secret);
  });

  it("keeps a stored secret the delta doesn't touch", async () => {
    storeProjectEnvironment({ OPENAI_KEY: "sk-project", RETRIES: 3 });
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });
    const delta = diff(
      { variables: { OPENAI_KEY: "[encrypted]", RETRIES: 3 } },
      { variables: { OPENAI_KEY: "[encrypted]", RETRIES: 4 } }
    );

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ environment: delta });

    expect(response.status).toBe(200);
    expect(writtenEnvironment()).toEqual({
      variables: { OPENAI_KEY: "sk-project", RETRIES: 4 },
      visible: undefined,
    });
  });

  it("never reveals a secret through a visible Variable of the same v1 name", async () => {
    storeProjectEnvironment(
      { OPEN_PAAS_PASSWORD: "shown", ARTWORKS_PASSWORD: "secret" },
      ["OPEN_PAAS_PASSWORD"]
    );
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });
    const delta = diff(
      { variables: { OPEN_PAAS_PASSWORD: "shown" } },
      { variables: { OPEN_PAAS_PASSWORD: "shown", API_URL: "https://x" } }
    );

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ environment: delta });

    expect(response.status).toBe(200);
    expect(writtenEnvironment()).toEqual({
      variables: { ARTWORKS_PASSWORD: "secret", API_URL: "https://x" },
      visible: [],
    });
  });

  it("renames the ArtWorks Variables of a Project Environment pasted from Piper v1", async () => {
    storeProjectEnvironment({ OPEN_PAAS_PASSWORD: "stored" });
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });
    const delta = diff(
      { variables: { OPEN_PAAS_PASSWORD: "[encrypted]" } },
      {
        variables: { OPEN_PAAS_USER: "artist", OPEN_PAAS_PASSWORD: "[hidden]" },
      }
    );

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ environment: delta });

    expect(response.status).toBe(200);
    expect(writtenEnvironment()).toEqual({
      variables: { ARTWORKS_USER: "artist", ARTWORKS_PASSWORD: "stored" },
      visible: undefined,
    });
  });

  it("takes a new value sent under a v1 name over the stored secret", async () => {
    storeProjectEnvironment({ ARTWORKS_PASSWORD: "old" });
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });
    const delta = diff(
      { variables: { ARTWORKS_PASSWORD: "[encrypted]" } },
      {
        variables: {
          ARTWORKS_PASSWORD: "[encrypted]",
          OPEN_PAAS_PASSWORD: "new",
        },
      }
    );

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ environment: delta });

    expect(response.status).toBe(200);
    expect(writtenEnvironment()).toEqual({
      variables: { ARTWORKS_PASSWORD: "new" },
      visible: undefined,
    });
  });

  it("keeps a stored secret when the placeholder pasted from Piper v1 is sent", async () => {
    storeProjectEnvironment({ OPENAI_KEY: "sk-project" });
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });
    const delta = diff(
      { variables: { OPENAI_KEY: "[encrypted]" } },
      {
        variables: { OPENAI_KEY: "[hidden]", MULEROUTER_API_KEY: "[hidden]" },
      }
    );

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ environment: delta });

    expect(response.status).toBe(200);
    expect(writtenEnvironment()).toEqual({
      variables: { OPENAI_KEY: "sk-project" },
      visible: undefined,
    });
  });

  it("binds a project variable to a user variable and drops its own value", async () => {
    storeProjectEnvironment({ OPENAI_KEY: "sk-project", RETRIES: 3 });
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });
    const delta = diff(
      { variables: { OPENAI_KEY: "[encrypted]", RETRIES: 3 } },
      {
        variables: { OPENAI_KEY: "[encrypted]", RETRIES: 3 },
        bindings: { OPENAI_KEY: "OPENAI_KEY_WORK" },
      }
    );

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ environment: delta });

    expect(response.status).toBe(200);
    const [, { $set }] = httpDoubles.projects.updateOne.mock.calls[0];
    expect($set.environment.bindings).toEqual({
      OPENAI_KEY: "OPENAI_KEY_WORK",
    });
    expect(writtenEnvironment().variables).toEqual({ RETRIES: 3 });
  });

  it.each([
    { name: "to an invalid name", bindings: { OPENAI_KEY: "not a name" } },
    { name: "of an invalid name", bindings: { "not a name": "OPENAI_KEY" } },
  ])("rejects a binding $name", async ({ bindings }) => {
    storeProjectEnvironment({});
    httpDoubles.projects.updateOne.mockResolvedValue({ matchedCount: 1 });
    const delta = diff({ variables: {} }, { variables: {}, bindings });

    const response = await context.request
      .patch("/api/projects/project-http/patch/revision-1")
      .set("user-token", userToken())
      .send({ environment: delta });

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.updateOne).not.toHaveBeenCalled();
  });

  it("shows a Visible Variable when the project is read", async () => {
    storeProjectEnvironment(
      { OPENAI_KEY: "sk-project", BASE_URL: "https://a" },
      ["BASE_URL"]
    );

    const response = await context.request
      .get("/api/projects/project-http")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body.environment.variables).toEqual({
      OPENAI_KEY: "[encrypted]",
      BASE_URL: "https://a",
    });
    expect(response.body.environment.visible).toEqual(["BASE_URL"]);
  });
});
