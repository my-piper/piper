import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp([
    () => import("api/me/get-me"),
    () => import("api/me/change-me-password"),
  ]);
});

describe("current user", () => {
  it("returns the stored profile without the password hash", async () => {
    const response = await context.request
      .get("/api/me")
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      _id: "admin-user",
      email: "admin-user@example.com",
      roles: ["admin"],
      createdAt: "2025-01-01T00:00:00.000Z",
    });
  });

  it("rejects anonymous requests", async () => {
    const response = await context.request.get("/api/me");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You aren't logged");
  });
});

describe("password change", () => {
  it("stores only a hash of the new password for the current user", async () => {
    const response = await context.request
      .post("/api/me/change-password")
      .set("user-token", userToken())
      .send({ password: "changed-password", _id: "admin-user" });

    expect(response.status).toBe(204);
    const [filter, { $set }] = httpDoubles.users.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "owner-user" });
    expect(Object.keys($set)).toEqual(["password"]);
    expect(await bcrypt.compare("changed-password", $set.password)).toBe(true);
  });

  it.each([
    { name: "a short password", body: { password: "short" } },
    { name: "a long password", body: { password: "x".repeat(33) } },
    { name: "a missing password", body: {} },
  ])("rejects $name", async ({ body }) => {
    const response = await context.request
      .post("/api/me/change-password")
      .set("user-token", userToken())
      .send(body);

    expect(response.status).toBe(400);
    expect(httpDoubles.users.updateOne).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests", async () => {
    const response = await context.request
      .post("/api/me/change-password")
      .send({ password: "changed-password" });

    expect(response.status).toBe(400);
    expect(httpDoubles.users.updateOne).not.toHaveBeenCalled();
  });
});
