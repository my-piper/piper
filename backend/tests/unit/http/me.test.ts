import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;
let scenario: ReturnType<typeof httpScenario>;

beforeEach(async () => {
  scenario = httpScenario();
  context = await createHttpApp([
    () => import("api/me/get-me"),
    () => import("api/me/change-me-password"),
    () => import("api/me/link-identity"),
    () => import("api/me/unlink-identity"),
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
      hasPassword: true,
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

const IDENTITY = {
  provider: "oidc",
  subject: "sso-subject",
  email: "jane@sso.example.com",
  linkedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("connected accounts", () => {
  it("lists identities and reports a missing password", async () => {
    const owner = scenario.users.get("owner-user");
    delete owner.password;
    Object.assign(owner, { identities: [IDENTITY] });

    const response = await context.request
      .get("/api/me")
      .set("user-token", userToken());

    expect(response.body).toMatchObject({
      hasPassword: false,
      identities: [{ ...IDENTITY, linkedAt: "2026-01-01T00:00:00.000Z" }],
    });
  });

  it("issues a single-use link ticket as an HttpOnly cookie", async () => {
    vi.stubEnv("OIDC_AUTH", "yes");
    context = await createHttpApp([() => import("api/me/link-identity")]);

    const response = await context.request
      .post("/api/me/identities/oidc/link")
      .set("user-token", userToken());

    expect(response.status).toBe(204);
    const [cookie] = response.headers["set-cookie"];
    const [, ticket] = cookie.match(
      /^oidc_link=([\w-]{43}); Max-Age=300; Path=\/; .*HttpOnly; SameSite=Lax/
    );
    expect(httpDoubles.redis.setEx).toHaveBeenCalledWith(
      `oidc:link:${ticket}`,
      300,
      "owner-user"
    );
  });

  it("refuses link tickets when SSO is disabled", async () => {
    const response = await context.request
      .post("/api/me/identities/oidc/link")
      .set("user-token", userToken());

    expect(response.status).toBe(400);
    expect(httpDoubles.redis.setEx).not.toHaveBeenCalled();
  });

  it("disconnects an identity when a password remains", async () => {
    Object.assign(scenario.users.get("owner-user"), { identities: [IDENTITY] });

    const response = await context.request
      .delete("/api/me/identities/oidc")
      .set("user-token", userToken());

    expect(response.status).toBe(204);
    expect(httpDoubles.users.updateOne).toHaveBeenCalledWith(
      { _id: "owner-user" },
      { $pull: { identities: { provider: "oidc" } } }
    );
  });

  it("keeps the only way to sign in", async () => {
    const owner = scenario.users.get("owner-user");
    delete owner.password;
    Object.assign(owner, { identities: [IDENTITY] });

    const response = await context.request
      .delete("/api/me/identities/oidc")
      .set("user-token", userToken());

    expect(response.status).toBe(400);
    expect(httpDoubles.users.updateOne).not.toHaveBeenCalled();
  });

  it("answers 404 for an identity that is not connected", async () => {
    const response = await context.request
      .delete("/api/me/identities/oidc")
      .set("user-token", userToken());

    expect(response.status).toBe(404);
  });
});
