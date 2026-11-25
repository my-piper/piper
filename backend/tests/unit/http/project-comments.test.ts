import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp([
    () => import("api/projects/comments/add-comment"),
    () => import("api/projects/comments/list-comments"),
    () => import("api/projects/get-project-summary"),
  ]);
});

describe("project comments and summary", () => {
  it.each(["owner-user", "admin-user"])(
    "lets %s read comments and the summary",
    async (user) => {
      httpDoubles.projectComments.countDocuments.mockResolvedValue(2);

      const comments = await context.request
        .get("/api/projects/project-http/comments")
        .set("user-token", userToken(user));
      const summary = await context.request
        .get("/api/projects/project-http/summary")
        .set("user-token", userToken(user));

      expect(comments.status).toBe(200);
      expect(summary.status).toBe(200);
      expect(summary.body).toEqual({ comments: 2 });
    }
  );

  it("lets the owner comment on a project", async () => {
    const response = await context.request
      .post("/api/projects/project-http/comments")
      .set("user-token", userToken("owner-user"))
      .send({ message: "Looks good" });

    expect(response.status).toBe(200);
    expect(httpDoubles.projectComments.insertOne).toHaveBeenCalledOnce();
  });

  it.each([
    ["reading comments of", "get", "/api/projects/project-http/comments"],
    ["commenting on", "post", "/api/projects/project-http/comments"],
    ["reading the summary of", "get", "/api/projects/project-http/summary"],
  ] as const)(
    "hides a project from another user %s it",
    async (_action, method, url) => {
      const response = await context.request[method](url)
        .set("user-token", userToken("other-user"))
        .send({ message: "Hi" });

      expect(response.status).toBe(404);
      expect(httpDoubles.projectComments.insertOne).not.toHaveBeenCalled();
      expect(httpDoubles.projectComments.find).not.toHaveBeenCalled();
      expect(httpDoubles.projectComments.countDocuments).not.toHaveBeenCalled();
    }
  );
});
