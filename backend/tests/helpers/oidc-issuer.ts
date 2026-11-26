import { createHash, randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export const OIDC_TEST_ISSUER = "https://sso.example.test/application/o/piper/";
export const OIDC_TEST_CLIENT_ID = "piper";

type Claims = Record<string, unknown>;

type Grant = { nonce: string; challenge: string; claims: Claims };

/**
 * An in-memory OpenID provider served through a `fetch` double: discovery,
 * JWKS and a token endpoint that checks PKCE and signs real ID tokens.
 */
export async function fakeOidcIssuer() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" };
  const grants = new Map<string, Grant>();

  const metadata = {
    issuer: OIDC_TEST_ISSUER,
    authorization_endpoint: `${OIDC_TEST_ISSUER}authorize`,
    token_endpoint: `${OIDC_TEST_ISSUER}token`,
    jwks_uri: `${OIDC_TEST_ISSUER}jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    code_challenge_methods_supported: ["S256"],
  };

  async function token(body: URLSearchParams): Promise<Response> {
    const grant = grants.get(body.get("code") ?? "");
    grants.delete(body.get("code") ?? "");
    const challenge = createHash("sha256")
      .update(body.get("code_verifier") ?? "")
      .digest("base64url");
    if (!grant || grant.challenge !== challenge) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }

    const idToken = await new SignJWT({ ...grant.claims, nonce: grant.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(OIDC_TEST_ISSUER)
      .setAudience(OIDC_TEST_CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    return Response.json({
      access_token: "access-token",
      token_type: "Bearer",
      expires_in: 300,
      id_token: idToken,
    });
  }

  async function fetch(
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : input);
    switch (url.href.split("?")[0]) {
      case `${OIDC_TEST_ISSUER}.well-known/openid-configuration`:
        return Response.json(metadata);
      case metadata.jwks_uri:
        return Response.json({ keys: [jwk] });
      case metadata.token_endpoint:
        return token(new URLSearchParams(String(init?.body ?? "")));
      default:
        return new Response("not found", { status: 404 });
    }
  }

  /** Plays the browser at the provider: returns the callback query string. */
  function authorize(
    location: string,
    claims: Claims,
    { nonce }: { nonce?: string } = {}
  ): string {
    const request = new URL(location).searchParams;
    const code = randomUUID();
    grants.set(code, {
      nonce: nonce ?? request.get("nonce") ?? "",
      challenge: request.get("code_challenge") ?? "",
      claims,
    });
    return new URLSearchParams({
      code,
      state: request.get("state") ?? "",
    }).toString();
  }

  return { fetch, authorize, metadata };
}
