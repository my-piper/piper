import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { HTTP_TEST_TIME, userToken } from "../../fixtures/http";
import { pipelineFixture, launchRequestFixture } from "../../fixtures/pipeline";
import { beforeEach, describe, expect, it } from "vitest";

let scenario: ReturnType<typeof httpScenario>;
let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  scenario = httpScenario();
  context = await createHttpApp([
    () => import("api/projects/list"),
    () => import("api/projects/tags/list-available-tags"),
    () => import("api/projects/get-project"),
    () => import("api/projects/add-project"),
    () => import("api/projects/update-project"),
    () => import("api/projects/delete-project"),
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
