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

let configuration: Promise<Configuration> | null = null;

function config(): Promise<Configuration> {
  configuration ??= discovery(
    new URL(OIDC_ISSUER),
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET
  ).catch((err) => {
    configuration = null;
    throw err;
  });
  return configuration;
}

export async function authorizationUrl(): Promise<string> {
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
  return url.href;
}

export async function exchangeCode(query: string): Promise<OidcClaims> {
  const callback = new URL(OIDC_CALLBACK_URL);
  callback.search = query;
  const state = callback.searchParams.get("state");
  if (!state) {
    throw new OidcSignInError("sso_failed", "Callback without state");
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
    preferredUsername:
      typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : undefined,
  };
}
