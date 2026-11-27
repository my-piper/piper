import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { pipelineFixture } from "../../fixtures/pipeline";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;
let redisResponses: Map<string, string>;

beforeEach(async () => {
  ({ redisResponses } = httpScenario());
  context = await createHttpApp([
    () => import("api/me/list-deploys"),
    () => import("api/deploys/get-deploy-sockets"),
  ]);
});

function deployFixture(changes: object = {}) {
  return {
    _id: "owner-user_summarizer",
    prefix: "owner-user",
    slug: "summarizer",
    deployedAt: "2025-06-01T00:00:00.000Z",
    project: { _id: "project-http", title: "Summarizer" },
    pipeline: pipelineFixture(),
    ...changes,
  };
}

describe("Deploys a user can run from a Node", () => {
  it("lists the user's Deploys that have pipeline outputs", async () => {
    httpDoubles.deploysCursor.toArray.mockResolvedValue([
      deployFixture(),
      deployFixture({
        slug: "no_outputs",
        pipeline: { ...pipelineFixture(), outputs: {} },
      }),
    ]);

    const response = await context.request
      .get("/api/me/deploys")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        prefix: "owner-user",
        slug: "summarizer",
        title: "Summarizer",
        deployedAt: "2025-06-01T00:00:00.000Z",
      },
    ]);
    expect(httpDoubles.deploys.find).toHaveBeenCalledWith(
      { prefix: { $in: ["owner-user"] } },
      expect.anything()
    );
    expect(httpDoubles.deploysCursor.sort).toHaveBeenCalledWith({
      deployedAt: -1,
    });
  });

  it.each([
    { user: "owner-user", prefixes: ["owner-user"] },
    { user: "admin-user", prefixes: ["admin-user", null] },
  ])("lists $prefixes for $user", async ({ user, prefixes }) => {
    const response = await context.request
      .get("/api/me/deploys")
      .set("user-token", userToken(user));

    expect(response.status).toBe(200);
    expect(httpDoubles.deploys.find).toHaveBeenCalledWith(
      { prefix: { $in: prefixes } },
      expect.anything()
    );
  });

  it("rejects an anonymous request", async () => {
    const response = await context.request.get("/api/me/deploys");

    expect(response.status).toBe(400);
  });
});

describe("Sockets of a Deploy", () => {
  it("returns the pipeline inputs and outputs as Node inputs and outputs", async () => {
    redisResponses.set(
      "deploy:owner-user:summarizer",
      JSON.stringify(deployFixture())
    );

    const response = await context.request
      .get("/api/deploys/owner-user/summarizer/sockets")
      .set("user-token", userToken("other-user"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      prefix: "owner-user",
      slug: "summarizer",
      title: "Summarizer",
      deployedAt: "2025-06-01T00:00:00.000Z",
      inputs: {
        enabled: {
          type: "boolean",
          title: "enabled",
          required: true,
          default: true,
        },
        count: { type: "integer", title: "count", default: 5 },
        text: { type: "string", title: "text", default: "default text" },
      },
      outputs: { result: { type: "json", title: "result" } },
    });
  });

  it("returns an unprefixed Deploy", async () => {
    redisResponses.set(
      "deploy:summarizer",
      JSON.stringify(deployFixture({ prefix: undefined }))
    );

    const response = await context.request
      .get("/api/deploys/summarizer/sockets")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body.slug).toBe("summarizer");
  });

  it("answers 400 for a missing Deploy", async () => {
    const response = await context.request
      .get("/api/deploys/owner-user/missing/sockets")
      .set("user-token", userToken());

    expect(response.status).toBe(400);
    expect(response.text).toContain("Deploy missing is not found");
  });

  it("rejects an anonymous request", async () => {
    const response = await context.request.get(
      "/api/deploys/owner-user/summarizer/sockets"
    );

    expect(response.status).toBe(400);
  });
});
