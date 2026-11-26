import {
  OIDC_CALLBACK_URL,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_ISSUER,
  OIDC_SCOPE,
} from "consts/oidc";
import { OIDC_STATE_EXPIRED, OIDC_STATE_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  Configuration,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";
import { OidcClaims, OidcSignInError } from "packages/users/oidc-sign-in";
import { OidcState } from "./models";

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

let configuration: Promise<Configuration> | null = null;

function config(): Promise<Configuration> {
  const issuer = new URL(OIDC_ISSUER);
  configuration ??= discovery(
    issuer,
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    undefined,
    // Plain HTTP only for a local provider, such as the compose `sso` profile.
    issuer.protocol === "http:" && LOCAL_HOSTS.includes(issuer.hostname)
      ? { execute: [allowInsecureRequests] }
      : {}
  ).catch((err) => {
    configuration = null;
    throw err;
  });
  return configuration;
}

export async function authorizationUrl(): Promise<{
  url: string;
  state: string;
}> {
  const verifier = randomPKCECodeVerifier();
  const state = randomState();
  const nonce = randomNonce();

  await redis.setEx(
    OIDC_STATE_KEY(state),
    OIDC_STATE_EXPIRED,
    JSON.stringify(toPlain(new OidcState({ verifier, nonce })))
  );

  const url = buildAuthorizationUrl(await config(), {
    redirect_uri: OIDC_CALLBACK_URL,
    scope: OIDC_SCOPE,
    code_challenge: await calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url: url.href, state };
}

/**
 * `browserState` is the state cookie set when this browser started the flow;
 * requiring it stops a callback link from signing a victim into someone
 * else's account (login CSRF).
 */
export async function exchangeCode(
  query: string,
  browserState: string | undefined
): Promise<OidcClaims> {
  const callback = new URL(OIDC_CALLBACK_URL);
  callback.search = query;
  const state = callback.searchParams.get("state");
  if (!state || state !== browserState) {
    throw new OidcSignInError("sso_failed", "State does not match browser");
  }

  const stored = await redis.getDel(OIDC_STATE_KEY(state));
  if (!stored) {
    throw new OidcSignInError("sso_failed", "Unknown or expired state");
  }
  const { verifier, nonce } = toInstance(JSON.parse(stored), OidcState);

  const tokens = await authorizationCodeGrant(await config(), callback, {
    pkceCodeVerifier: verifier,
    expectedState: state,
    expectedNonce: nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  return {
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    emailVerified: claims.email_verified === true,
    preferredUsername:
      typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : undefined,
  };
}
