import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";

type Errors = typeof import("core-kit/types/errors");
let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp();
});

describe("HTTP error mapping", () => {
  it.each([
    {
      name: "data error",
      make: ({ DataError }: Errors) =>
        new DataError("bad value", { input: "text" }),
      status: 400,
      body: { message: "bad value", details: { input: "text" } },
    },
    {
      name: "data error without details",
      make: ({ DataError }: Errors) => new DataError("bad value", null),
      status: 400,
      text: "bad value",
    },
    {
      name: "unauthorized",
      make: ({ UnauthorizedError }: Errors) =>
        new UnauthorizedError("access denied"),
      status: 401,
      text: "access denied",
    },
    {
      name: "not found",
      make: ({ NotFoundError }: Errors) => new NotFoundError("missing project"),
      status: 404,
      text: "missing project",
    },
    {
      name: "rate limit",
      make: ({ TooManyRequestsError }: Errors) =>
        new TooManyRequestsError("try later"),
      status: 429,
      text: "try later",
    },
  ])("maps $name to $status", async ({ make, status, body, text }) => {
    const { handle } = await import("utils/http");
    const failure = make(await import("core-kit/types/errors"));
    context.app.get(
      "/error",
      handle(() => async () => {
        throw failure;
      })
    );

    const response = await context.request.get("/error");

    expect(response.status).toBe(status);
    if (body) expect(response.body).toEqual(body);
    if (text) expect(response.text).toBe(text);
    expect(httpDoubles.captureException).not.toHaveBeenCalled();
  });

  it("reports unexpected errors and hides their internal message", async () => {
    const { handle } = await import("utils/http");
    const failure = new Error("private internal details");
    context.app.get(
      "/error",
      handle(() => async () => {
        throw failure;
      })
    );

    const response = await context.request.get("/error");

    expect(response.status).toBe(500);
    expect(response.text).toBe(
      "SERVICE_OFFLINE|Our service temporarily unavailable"
    );
    expect(httpDoubles.captureException).toHaveBeenCalledExactlyOnceWith(
      failure
    );
  });

  it("preserves the pen-testing redirect without following it", async () => {
    const { handle } = await import("utils/http");
    const { PenTestingError } = await import("core-kit/types/errors");
    context.app.get(
      "/error",
      handle(() => async () => {
        throw new PenTestingError();
      })
    );

    const response = await context.request.get("/error").redirects(0);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
  });
});

describe("HTTP responses and injector", () => {
  it.each([null, 0, ""])("returns 204 for %j", async (value) => {
    const { handle } = await import("utils/http");
    context.app.get(
      "/value",
      handle(() => async () => value)
    );

    const response = await context.request.get("/value");

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
  });

  it("serializes objects and sends the production no-cache headers", async () => {
    const { handle } = await import("utils/http");
    context.app.get(
      "/value",
      handle(() => async () => ({ enabled: false, count: 0, text: "" }))
    );

    const response = await context.request.get("/value");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: false, count: 0, text: "" });
    expect(response.headers["cache-control"]).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    expect(response.headers.pragma).toBe("no-cache");
  });

  it("allows handlers to send their own response", async () => {
    const { handle } = await import("utils/http");
    context.app.get(
      "/value",
      handle(() => async (_req, res) => {
        res.status(202).json({ queued: true });
      })
    );

    const response = await context.request.get("/value");

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ queued: true });
  });

  it("takes language from query before headers/cookies and uses the forwarded client IP", async () => {
    const { handle } = await import("utils/http");
    context.app.get(
      "/injector",
      handle(({ language, ip }) => async () => ({ language, ip }))
    );

    const response = await context.request
      .get("/injector?language=ru")
      .set("language", "en")
      .set("Cookie", "language=de")
      .set("cf-connecting-ip", "192.0.2.5");

    expect(response.body).toEqual({ language: "ru", ip: "192.0.2.5" });
  });

  it.each([
    { guard: "checkAdmin", user: "admin-user", status: 200 },
    { guard: "checkAdmin", user: "owner-user", status: 400 },
    { guard: "checkEngineer", user: "engineer-user", status: 200 },
    { guard: "checkEngineer", user: "admin-user", status: 200 },
    { guard: "checkEngineer", user: "owner-user", status: 400 },
  ])("enforces $guard for $user", async ({ guard, user, status }) => {
    const http = await import("utils/http");
    context.app.get(
      "/role",
      http.handle(({ currentUser }) => async () => {
        http[guard](currentUser);
        return { allowed: true };
      })
    );

    const response = await context.request
      .get("/role")
      .set("user-token", userToken(user));

    expect(response.status).toBe(status);
  });
});
