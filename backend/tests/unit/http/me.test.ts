import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it } from "vitest";

const CURSOR = "01HZY0000000000000000000AB";

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp([
    () => import("api/me/get-me"),
    () => import("api/me/change-me-password"),
    () => import("api/balance-refills/list"),
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
      balance: { remaining: 10 },
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

describe("balance refills", () => {
  it("lists the current user's newest refills", async () => {
    const rows = [{ user: "owner-user", amount: 5, cursor: CURSOR }];
    httpDoubles.clickhouse.query.mockResolvedValue({ json: async () => rows });

    const response = await context.request
      .get("/api/balance-refills")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(rows);
    expect(httpDoubles.clickhouse.query).toHaveBeenCalledExactlyOnceWith({
      query: `SELECT * FROM user_balance_refills WHERE "user" = 'owner-user' ORDER BY cursor desc LIMIT 20`,
      format: "JSONEachRow",
    });
  });

  it("continues from a cursor", async () => {
    httpDoubles.clickhouse.query.mockResolvedValue({ json: async () => [] });

    await context.request
      .get("/api/balance-refills")
      .query({ cursor: CURSOR })
      .set("user-token", userToken());

    expect(httpDoubles.clickhouse.query.mock.calls[0][0].query).toBe(
      `SELECT * FROM user_balance_refills WHERE "user" = 'owner-user' AND cursor < '${CURSOR}' ORDER BY cursor desc LIMIT 20`
    );
  });

  it.each([
    { name: "a malformed cursor", cursor: "x' OR '1'='1" },
    { name: "a short cursor", cursor: "01HZY" },
  ])("rejects $name before querying", async ({ cursor }) => {
    const response = await context.request
      .get("/api/balance-refills")
      .query({ cursor })
      .set("user-token", userToken());

    expect(response.status).toBe(400);
    expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests", async () => {
    const response = await context.request.get("/api/balance-refills");

    expect(response.status).toBe(400);
    expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
  });
});
