import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { HTTP_TEST_SECRET, HTTP_TEST_TIME } from "../../fixtures/http";
import bcrypt from "bcrypt";
import {
  USER_INITIAL_BALANCE_LOCK,
  USER_INITIAL_BALANCE_LOCK_EXPIRED,
} from "consts/redis";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CODE_KEY = "confirmation-code:new@example.com";
const signup = {
  email: "new@example.com",
  login: "new-user",
  password: "new-password",
  code: "123456",
};

let scenario: ReturnType<typeof httpScenario>;

beforeEach(() => {
  scenario = httpScenario();
  vi.stubEnv("ALLOW_SIGNUP", "yes");
  scenario.redisResponses.set(CODE_KEY, "123456");
  httpDoubles.axios.mockResolvedValue({ data: { status: "VALID" } });
});

async function signupApp() {
  return createHttpApp([() => import("api/users/signup")]);
}

describe("signup", () => {
  it("creates a user with a hashed password and returns a user token", async () => {
    const context = await signupApp();

    const response = await context.request.post("/api/signup").send(signup);

    expect(response.status).toBe(200);
    expect(jwt.verify(response.body.token, HTTP_TEST_SECRET)).toMatchObject({
      _id: "new-user",
      email: "new@example.com",
    });
    const [document] = httpDoubles.users.insertOne.mock.calls[0];
    expect(document).toMatchObject({
      _id: "new-user",
      email: "new@example.com",
      createdAt: HTTP_TEST_TIME,
      cursor: "http-generated-cursor",
    });
    expect(await bcrypt.compare("new-password", document.password)).toBe(true);
    expect(httpDoubles.axios).toHaveBeenCalledWith(
      expect.objectContaining({ params: { email: "new@example.com" } })
    );
  });

  it("does not expose the password hash in the response or token", async () => {
    const context = await signupApp();

    const response = await context.request.post("/api/signup").send(signup);

    expect(response.body.user).not.toHaveProperty("password");
    expect(jwt.decode(response.body.token)).not.toHaveProperty("password");
  });

  it.each([
    { name: "a wrong code", body: { ...signup, code: "000000" } },
    { name: "a missing code", body: { ...signup, code: undefined } },
  ])("rejects $name before verifying the email", async ({ body }) => {
    const context = await signupApp();

    const response = await context.request.post("/api/signup").send(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Wrong confirmation code");
    expect(httpDoubles.axios).not.toHaveBeenCalled();
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });

  it("requires a confirmation code to have been sent", async () => {
    scenario.redisResponses.delete(CODE_KEY);
    const context = await signupApp();

    const response = await context.request
      .post("/api/signup")
      .send({ ...signup, code: null });

    expect(response.status).toBe(400);
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "a plus address",
      email: "new+alias@example.com",
      verifier: "VALID",
    },
    {
      name: "an undeliverable address",
      email: "new@example.com",
      verifier: "INVALID",
    },
  ])("rejects $name", async ({ email, verifier }) => {
    scenario.redisResponses.set(`confirmation-code:${email}`, "123456");
    httpDoubles.axios.mockResolvedValue({ data: { status: verifier } });
    const context = await signupApp();

    const response = await context.request
      .post("/api/signup")
      .send({ ...signup, email });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Try another email");
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });

  it.each([
    { name: "an invalid login", body: { ...signup, login: "No" } },
    { name: "an invalid email", body: { ...signup, email: "not-an-email" } },
  ])("validates $name before reading the code", async ({ body }) => {
    const context = await signupApp();

    const response = await context.request.post("/api/signup").send(body);

    expect(response.status).toBe(400);
    expect(httpDoubles.redis.get).not.toHaveBeenCalled();
  });

  it("reports an existing login", async () => {
    httpDoubles.users.insertOne.mockRejectedValue({ code: 11000 });
    const context = await signupApp();

    const response = await context.request.post("/api/signup").send(signup);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("User exists");
  });

  it("is rejected when signup is disabled", async () => {
    vi.stubEnv("ALLOW_SIGNUP", "no");
    const context = await signupApp();

    const response = await context.request.post("/api/signup").send(signup);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Signup has been disabled");
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });
});

describe("initial signup balance", () => {
  it("refills the configured balance once per client IP", async () => {
    vi.stubEnv("INITIAL_USER_BALANCE", "5");
    const context = await signupApp();

    const response = await context.request
      .post("/api/signup")
      .set("cf-connecting-ip", "192.0.2.10")
      .send(signup);

    expect(response.status).toBe(200);
    expect(httpDoubles.clickhouse.insert).toHaveBeenCalledExactlyOnceWith({
      table: "user_balance_refills",
      values: [
        {
          user: "new-user",
          amount: 5,
          refilledAt: "2026-01-02 03:04:05",
          cursor: "http-generated-cursor",
        },
      ],
      format: "JSONEachRow",
    });
    expect(httpDoubles.plans.updateBalance).toHaveBeenCalledExactlyOnceWith({
      user: "new-user",
    });
    expect(httpDoubles.redis.setEx).toHaveBeenCalledWith(
      USER_INITIAL_BALANCE_LOCK("192.0.2.10"),
      USER_INITIAL_BALANCE_LOCK_EXPIRED,
      "x"
    );
  });

  it("skips the refill when the IP already received one", async () => {
    vi.stubEnv("INITIAL_USER_BALANCE", "5");
    httpDoubles.redis.GET.mockResolvedValue("x");
    const context = await signupApp();

    const response = await context.request
      .post("/api/signup")
      .set("cf-connecting-ip", "192.0.2.10")
      .send(signup);

    expect(response.status).toBe(200);
    expect(httpDoubles.redis.GET).toHaveBeenCalledWith(
      USER_INITIAL_BALANCE_LOCK("192.0.2.10")
    );
    expect(httpDoubles.clickhouse.insert).not.toHaveBeenCalled();
    expect(httpDoubles.plans.updateBalance).not.toHaveBeenCalled();
  });

  it("does not refill when no initial balance is configured", async () => {
    const context = await signupApp();

    await context.request.post("/api/signup").send(signup);

    expect(httpDoubles.redis.GET).not.toHaveBeenCalled();
    expect(httpDoubles.clickhouse.insert).not.toHaveBeenCalled();
  });
});

describe("signup email confirmation", () => {
  it("stores a short-lived code and emails it", async () => {
    const context = await signupApp();

    const response = await context.request
      .post("/api/signup/confirm")
      .send({ email: "new@example.com" });

    expect(response.status).toBe(204);
    expect(httpDoubles.redis.setEx).toHaveBeenCalledExactlyOnceWith(
      CODE_KEY,
      300,
      "http-generated-id"
    );
    expect(httpDoubles.sendEmail).toHaveBeenCalledExactlyOnceWith(
      "new@example.com",
      "Your code",
      expect.stringContaining("http-generated-id")
    );
    expect(httpDoubles.axios).not.toHaveBeenCalled();
  });

  it("verifies the captcha with the client IP when required", async () => {
    vi.stubEnv("CAPTCHA_REQUIRED", "yes");
    vi.stubEnv("CAPTCHA_SECRET", "captcha-secret");
    httpDoubles.axios.mockResolvedValue({ data: { success: true } });
    const context = await signupApp();

    const response = await context.request
      .post("/api/signup/confirm")
      .set("cf-connecting-ip", "192.0.2.10")
      .send({ email: "new@example.com", captcha: "captcha-response" });
    const [{ url, data }] = httpDoubles.axios.mock.calls[0];

    expect(response.status).toBe(204);
    expect(url).toBe("https://hcaptcha.com/siteverify");
    expect(Object.fromEntries(data)).toEqual({
      response: "captcha-response",
      secret: "captcha-secret",
      remoteip: "192.0.2.10",
    });
    expect(httpDoubles.sendEmail).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "a failed captcha",
      verify: () =>
        httpDoubles.axios.mockResolvedValue({ data: { success: false } }),
      message: "Wrong captcha",
    },
    {
      name: "an unavailable captcha service",
      verify: () => httpDoubles.axios.mockRejectedValue(new Error("offline")),
      message: "Can't check captcha",
    },
  ])("rejects $name without sending a code", async ({ verify, message }) => {
    vi.stubEnv("CAPTCHA_REQUIRED", "yes");
    verify();
    const context = await signupApp();

    const response = await context.request
      .post("/api/signup/confirm")
      .send({ email: "new@example.com", captcha: "captcha-response" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
    expect(httpDoubles.redis.setEx).not.toHaveBeenCalled();
    expect(httpDoubles.sendEmail).not.toHaveBeenCalled();
  });

  it("validates the email address", async () => {
    const context = await signupApp();

    const response = await context.request
      .post("/api/signup/confirm")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(httpDoubles.sendEmail).not.toHaveBeenCalled();
  });
});
