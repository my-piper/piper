import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { HTTP_TEST_TIME, userToken } from "../../fixtures/http";
import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it } from "vitest";

const CURSOR = "01HZY0000000000000000000AB";

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp([
    () => import("api/users/list"),
    () => import("api/users/add-user"),
    () => import("api/users/get-user"),
    () => import("api/users/update-user"),
    () => import("api/users/delete-user"),
  ]);
});

const adminRoutes = [
  { route: "GET /api/users", send: () => context.request.get("/api/users") },
  {
    route: "POST /api/users",
    send: () =>
      context.request
        .post("/api/users")
        .send({ _id: "created", email: "created@example.com" }),
  },
  {
    route: "PATCH /api/users/:_id",
    send: () =>
      context.request.patch("/api/users/other-user").send({
        _id: "other-user",
        email: "other-user@example.com",
        roles: ["admin"],
      }),
  },
  {
    route: "DELETE /api/users/:_id",
    send: () => context.request.delete("/api/users/other-user"),
  },
];

describe("admin user routes", () => {
  it.each(
    adminRoutes.flatMap((route) => [
      { ...route, caller: "anonymous", headers: () => ({}) },
      ...["owner-user", "engineer-user"].map((user) => ({
        ...route,
        caller: user,
        // Sign during the test so tokens use the scenario clock.
        headers: () => ({ "user-token": userToken(user) }),
      })),
    ])
  )("reject $route from $caller", async ({ send, headers }) => {
    const response = await send().set(headers());

    expect(response.status).toBe(400);
    expect(httpDoubles.users.find).not.toHaveBeenCalled();
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
    expect(httpDoubles.users.updateOne).not.toHaveBeenCalled();
    expect(httpDoubles.users.deleteOne).not.toHaveBeenCalled();
  });
});

describe("user listing", () => {
  it("returns the newest page of users without password hashes", async () => {
    httpDoubles.usersCursor.toArray.mockResolvedValue([
      { _id: "owner-user", email: "owner-user@example.com" },
    ]);

    const response = await context.request
      .get("/api/users")
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { _id: "owner-user", email: "owner-user@example.com" },
    ]);
    const [filter, { projection }] = httpDoubles.users.find.mock.calls[0];
    expect(filter).toEqual({});
    expect(projection).not.toHaveProperty("password");
    expect(httpDoubles.usersCursor.sort).toHaveBeenCalledWith({ cursor: -1 });
    expect(httpDoubles.usersCursor.limit).toHaveBeenCalledWith(30);
  });

  it("filters by case-insensitive email search and cursor", async () => {
    const response = await context.request
      .get("/api/users")
      .query({ search: "Example", cursor: CURSOR })
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
    expect(httpDoubles.users.find.mock.calls[0][0]).toEqual({
      email: { $regex: /Example/i },
      cursor: { $lt: CURSOR },
    });
  });

  it("treats search text literally", async () => {
    const response = await context.request
      .get("/api/users")
      .query({ search: "a(b" })
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(200);
  });

  it("rejects a malformed cursor", async () => {
    const response = await context.request
      .get("/api/users")
      .query({ cursor: "not-a-ulid" })
      .set("user-token", userToken("admin-user"));

    expect(response.status).toBe(400);
    expect(httpDoubles.users.find).not.toHaveBeenCalled();
  });
});

describe("user creation", () => {
  it("hashes the password and omits it from the response", async () => {
    const response = await context.request
      .post("/api/users")
      .set("user-token", userToken("admin-user"))
      .send({
        _id: "created",
        email: "created@example.com",
        password: "created-password",
        roles: ["engineer"],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      _id: "created",
      email: "created@example.com",
      roles: ["engineer"],
      createdAt: HTTP_TEST_TIME.toISOString(),
      cursor: "http-generated-cursor",
    });
    const [document] = httpDoubles.users.insertOne.mock.calls[0];
    expect(await bcrypt.compare("created-password", document.password)).toBe(
      true
    );
  });

  it.each([
    { name: "an invalid login", body: { _id: "No", email: "a@example.com" } },
    {
      name: "an unknown role",
      body: { _id: "created", email: "a@example.com", roles: ["root"] },
    },
    {
      name: "an unexpected field",
      body: {
        _id: "created",
        email: "a@example.com",
        balance: { remaining: 100 },
      },
    },
  ])("rejects $name with the user schema", async ({ body }) => {
    const response = await context.request
      .post("/api/users")
      .set("user-token", userToken("admin-user"))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("User schema invalid");
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });

  it("reports an existing user", async () => {
    httpDoubles.users.insertOne.mockRejectedValue({ code: 11000 });

    const response = await context.request
      .post("/api/users")
      .set("user-token", userToken("admin-user"))
      .send({ _id: "owner-user", email: "owner-user@example.com" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("User exists");
  });
});

describe("user reads", () => {
  it("returns public profile fields to a logged-in user", async () => {
    const response = await context.request
      .get("/api/users/admin-user")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      _id: "admin-user",
      email: "admin-user@example.com",
      roles: ["admin"],
    });
  });

  it("returns no content for a missing user", async () => {
    const response = await context.request
      .get("/api/users/missing-user")
      .set("user-token", userToken());

    expect(response.status).toBe(204);
  });

  it("rejects anonymous reads", async () => {
    const response = await context.request.get("/api/users/admin-user");

    expect(response.status).toBe(400);
  });
});

describe("user updates", () => {
  it("lets an admin change roles and hashes a new password", async () => {
    const response = await context.request
      .patch("/api/users/owner-user")
      .set("user-token", userToken("admin-user"))
      .send({
        _id: "owner-user",
        email: "owner-user@example.com",
        roles: ["engineer"],
        password: "changed-password",
      });

    expect(response.status).toBe(200);
    const [filter, { $set }] = httpDoubles.users.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "owner-user" });
    expect($set).toMatchObject({ roles: ["engineer"] });
    expect(await bcrypt.compare("changed-password", $set.password)).toBe(true);
  });

  it("does not return the password hash", async () => {
    const response = await context.request
      .patch("/api/users/owner-user")
      .set("user-token", userToken("admin-user"))
      .send({
        _id: "owner-user",
        email: "owner-user@example.com",
        password: "changed-password",
      });

    expect(response.body).not.toHaveProperty("password");
  });

  it("rejects fields outside the user schema", async () => {
    const response = await context.request
      .patch("/api/users/owner-user")
      .set("user-token", userToken("admin-user"))
      .send({
        _id: "owner-user",
        email: "owner-user@example.com",
        balance: { remaining: 1000 },
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("User schema invalid");
    expect(httpDoubles.users.updateOne).not.toHaveBeenCalled();
  });
});

describe("user deletion", () => {
  it.each([
    { deletedCount: 1, status: 204 },
    { deletedCount: 0, status: 404 },
  ])(
    "returns $status when $deletedCount users are deleted",
    async ({ deletedCount, status }) => {
      httpDoubles.users.deleteOne.mockResolvedValue({ deletedCount });

      const response = await context.request
        .delete("/api/users/owner-user")
        .set("user-token", userToken("admin-user"));

      expect(response.status).toBe(status);
      expect(httpDoubles.users.deleteOne).toHaveBeenCalledExactlyOnceWith({
        _id: "owner-user",
      });
    }
  );
});
