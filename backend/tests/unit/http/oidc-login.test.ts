import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import {
  fakeOidcIssuer,
  OIDC_TEST_CLIENT_ID,
  OIDC_TEST_ISSUER,
} from "../../helpers/oidc-issuer";
import { HTTP_TEST_SECRET, HTTP_TEST_TIME } from "../../fixtures/http";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SUBJECT = "sso-subject-1";
const CLAIMS = {
  sub: SUBJECT,
  email: "jane@example.com",
  email_verified: true,
  preferred_username: "Jane.Doe",
};

let scenario: ReturnType<typeof httpScenario>;
let issuer: Awaited<ReturnType<typeof fakeOidcIssuer>>;
let context: Awaited<ReturnType<typeof createHttpApp>>;
let states: Map<string, string>;

function enableOidc() {
  vi.stubEnv("OIDC_AUTH", "yes");
  vi.stubEnv("OIDC_ISSUER", OIDC_TEST_ISSUER);
  vi.stubEnv("OIDC_CLIENT_ID", OIDC_TEST_CLIENT_ID);
  vi.stubEnv("OIDC_CLIENT_SECRET", "client-secret");
  vi.stubEnv("BASE_URL", "http://piper.test");
}

function linkUser(user: { _id: string; email: string }, subject: string) {
  const findByEmail = httpDoubles.users.findOne.getMockImplementation();
  httpDoubles.users.findOne.mockImplementation(async (query, options) =>
    query.identities?.$elemMatch?.subject === subject
      ? { _id: user._id, email: user.email }
      : findByEmail(query, options)
  );
}

function handedOverAuthorization(html: string) {
  const [, literal] = html.match(/setItem\('authorization', (".*?")\);/s);
  return JSON.parse(JSON.parse(literal));
}

async function startSignIn() {
  const response = await context.request.get("/oidc");
  return response.headers.location as string;
}

async function signIn(claims: Record<string, unknown> = CLAIMS) {
  const query = issuer.authorize(await startSignIn(), claims);
  return context.request.get(`/oidc/callback?${query}`);
}

beforeEach(async () => {
  scenario = httpScenario();
  enableOidc();
  issuer = await fakeOidcIssuer();
  vi.mocked(fetch).mockImplementation(issuer.fetch);
  states = new Map();
  httpDoubles.redis.setEx.mockImplementation(async (key, _ttl, value) => {
    states.set(key, value);
  });
  states.set("oidc:link:ticket-1", "other-user");
  httpDoubles.redis.getDel.mockImplementation(async (key) => {
    const value = states.get(key) ?? null;
    states.delete(key);
    return value;
  });
  httpDoubles.users.insertOne.mockResolvedValue({ acknowledged: true });
  context = await createHttpApp([() => import("packages/oauth/oidc")]);
});

describe("OIDC sign-in start", () => {
  it("redirects to the provider with PKCE, state and nonce", async () => {
    const location = new URL(await startSignIn());

    expect(location.origin + location.pathname).toBe(
      issuer.metadata.authorization_endpoint
    );
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: OIDC_TEST_CLIENT_ID,
      response_type: "code",
      redirect_uri: "http://piper.test/oauth/oidc/callback",
      scope: "openid email profile",
      code_challenge_method: "S256",
    });
    const state = location.searchParams.get("state");
    expect(httpDoubles.redis.setEx).toHaveBeenCalledWith(
      `oidc:state:${state}`,
      600,
      expect.any(String)
    );
  });

  it.each([
    { issuer: "http://localhost:9080/application/o/piper/", local: true },
    { issuer: "http://sso.example.test/application/o/piper/", local: false },
  ])(
    "accepts a plain-HTTP issuer only on localhost: $issuer",
    async ({ issuer: url, local }) => {
      const served = await fakeOidcIssuer(url);
      vi.mocked(fetch).mockImplementation(served.fetch);
      vi.stubEnv("OIDC_ISSUER", url);
      context = await createHttpApp([() => import("packages/oauth/oidc")]);

      const location = await startSignIn();

      expect(location.startsWith(served.metadata.authorization_endpoint)).toBe(
        local
      );
    }
  );

  it("is not mounted when OIDC is disabled", async () => {
    vi.stubEnv("OIDC_AUTH", "no");
    context = await createHttpApp([() => import("packages/oauth/oidc")]);

    const response = await context.request.get("/oidc");

    expect(response.status).toBe(404);
  });
});

describe("OIDC callback", () => {
  it("creates a user for a new identity and hands over a token", async () => {
    const response = await signIn();

    expect(response.status).toBe(200);
    expect(httpDoubles.users.insertOne).toHaveBeenCalledWith({
      _id: "jane.doe",
      email: "jane@example.com",
      createdAt: HTTP_TEST_TIME,
      cursor: expect.any(String),
      identities: [
        {
          provider: "oidc",
          subject: SUBJECT,
          email: "jane@example.com",
          linkedAt: HTTP_TEST_TIME,
        },
      ],
    });
    const authorization = handedOverAuthorization(response.text);
    expect(authorization.user).toEqual({
      _id: "jane.doe",
      email: "jane@example.com",
    });
    expect(jwt.verify(authorization.token, HTTP_TEST_SECRET)).toMatchObject({
      _id: "jane.doe",
      email: "jane@example.com",
    });
  });

  it("tries a suffixed username when the first one is taken", async () => {
    httpDoubles.users.insertOne
      .mockRejectedValueOnce({ code: 11000, keyPattern: { _id: 1 } })
      .mockResolvedValueOnce({ acknowledged: true });

    const response = await signIn();

    expect(response.status).toBe(200);
    expect(httpDoubles.users.insertOne).toHaveBeenCalledTimes(2);
    // The HTTP boundaries replace nanoid, so only the stem is predictable.
    const retried = httpDoubles.users.insertOne.mock.calls[1][0]._id;
    expect(retried).not.toBe("jane.doe");
    expect(retried.startsWith("jane.doe")).toBe(true);
  });

  it("signs in the linked user by subject and refreshes the identity email", async () => {
    linkUser(scenario.users.get("owner-user"), SUBJECT);

    const response = await signIn({ ...CLAIMS, email: "new@example.com" });

    expect(response.status).toBe(200);
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
    expect(httpDoubles.users.updateOne).toHaveBeenCalledWith(
      { _id: "owner-user" },
      { $set: { "identities.$[identity].email": "new@example.com" } },
      {
        arrayFilters: [
          { "identity.provider": "oidc", "identity.subject": SUBJECT },
        ],
      }
    );
    expect(handedOverAuthorization(response.text).user._id).toBe("owner-user");
  });

  it("refuses an identity whose email belongs to an existing account", async () => {
    const response = await signIn({
      ...CLAIMS,
      email: "owner-user@example.com",
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "/en/login?error=sso_account_exists"
    );
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });

  it.each([
    { name: "an unknown state", query: "code=x&state=unknown" },
    { name: "no state", query: "code=x" },
  ])("fails on $name", async ({ query }) => {
    const response = await context.request.get(`/oidc/callback?${query}`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/en/login?error=sso_failed");
  });

  it("accepts a state only once", async () => {
    const query = issuer.authorize(await startSignIn(), CLAIMS);
    await context.request.get(`/oidc/callback?${query}`);

    const replay = await context.request.get(`/oidc/callback?${query}`);

    expect(replay.headers.location).toBe("/en/login?error=sso_failed");
  });

  it("rejects an ID token with a different nonce", async () => {
    const query = issuer.authorize(await startSignIn(), CLAIMS, {
      nonce: "forged",
    });

    const response = await context.request.get(`/oidc/callback?${query}`);

    expect(response.headers.location).toBe("/en/login?error=sso_failed");
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });

  it("sets an HttpOnly state cookie when the flow starts", async () => {
    const response = await context.request.get("/oidc");

    const state = new URL(response.headers.location).searchParams.get("state");
    expect(response.headers["set-cookie"][0]).toMatch(
      new RegExp(
        `^oidc_state=${state}; Max-Age=600; Path=/; .*HttpOnly; SameSite=Lax`
      )
    );
  });

  it("rejects a callback from a browser that did not start the flow", async () => {
    const query = issuer.authorize(await startSignIn(), CLAIMS);
    const victim = await createHttpApp([() => import("packages/oauth/oidc")]);

    const response = await victim.request.get(`/oidc/callback?${query}`);

    expect(response.headers.location).toBe("/en/login?error=sso_failed");
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });

  it("does not create an account from an unverified email", async () => {
    const response = await signIn({ ...CLAIMS, email_verified: false });

    expect(response.headers.location).toBe("/en/login?error=sso_failed");
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });

  it("signs in a linked user even when the email is not verified", async () => {
    linkUser(scenario.users.get("owner-user"), SUBJECT);

    const response = await signIn({ ...CLAIMS, email_verified: false });

    expect(response.status).toBe(200);
  });

  it("fails when the ID token has no email", async () => {
    const response = await signIn({ sub: SUBJECT });

    expect(response.headers.location).toBe("/en/login?error=sso_failed");
  });
});

describe("connecting an identity to a signed-in user", () => {
  async function connect(claims: Record<string, unknown> = CLAIMS) {
    const start = await context.request
      .get("/oidc?link")
      .set("Cookie", "oidc_link=ticket-1");
    const query = issuer.authorize(start.headers.location, claims);
    return context.request.get(`/oidc/callback?${query}`);
  }

  it("ignores a ticket in the URL: a link from someone else binds nothing", async () => {
    const response = await context.request.get("/oidc?link=ticket-1");

    expect(response.headers.location).toBe("/en/projects?sso=sso_failed");
    expect(states.get("oidc:link:ticket-1")).toBe("other-user");
    expect(httpDoubles.redis.setEx).not.toHaveBeenCalled();
  });

  it("binds the identity to the ticket's user", async () => {
    httpDoubles.users.updateOne.mockResolvedValue({ matchedCount: 1 });

    const response = await connect({ ...CLAIMS, email_verified: false });

    expect(response.headers.location).toBe("/en/projects?sso=linked");
    expect(httpDoubles.users.updateOne).toHaveBeenCalledWith(
      { _id: "other-user", "identities.provider": { $ne: "oidc" } },
      {
        $push: {
          identities: {
            provider: "oidc",
            subject: SUBJECT,
            email: "jane@example.com",
            linkedAt: HTTP_TEST_TIME,
          },
        },
      }
    );
    expect(httpDoubles.users.insertOne).not.toHaveBeenCalled();
  });

  it("uses a ticket only once", async () => {
    await context.request.get("/oidc?link").set("Cookie", "oidc_link=ticket-1");

    const replay = await context.request
      .get("/oidc?link")
      .set("Cookie", "oidc_link=ticket-1");

    expect(replay.headers.location).toBe("/en/projects?sso=sso_failed");
  });

  it("keeps the ticket when the provider is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("provider down"));

    const response = await context.request
      .get("/oidc?link")
      .set("Cookie", "oidc_link=ticket-1");

    expect(response.headers.location).toBe("/en/projects?sso=sso_failed");
    expect(states.get("oidc:link:ticket-1")).toBe("other-user");
  });

  it("refuses an identity connected to another user", async () => {
    linkUser(scenario.users.get("owner-user"), SUBJECT);

    const response = await connect();

    expect(response.headers.location).toBe(
      "/en/projects?sso=sso_linked_elsewhere"
    );
    expect(httpDoubles.users.updateOne).not.toHaveBeenCalled();
  });

  it("accepts the identity the user already has", async () => {
    linkUser(scenario.users.get("other-user"), SUBJECT);

    const response = await connect();

    expect(response.headers.location).toBe("/en/projects?sso=linked");
    expect(httpDoubles.users.updateOne).not.toHaveBeenCalled();
  });

  it("refuses a second identity of the same provider", async () => {
    httpDoubles.users.updateOne.mockResolvedValue({ matchedCount: 0 });

    const response = await connect();

    expect(response.headers.location).toBe(
      "/en/projects?sso=sso_already_connected"
    );
  });

  it("maps a race on the identity index to linked elsewhere", async () => {
    httpDoubles.users.updateOne.mockRejectedValue({ code: 11000 });

    const response = await connect();

    expect(response.headers.location).toBe(
      "/en/projects?sso=sso_linked_elsewhere"
    );
  });
});
