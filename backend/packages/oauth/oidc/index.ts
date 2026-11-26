import { BASE_URL } from "consts/core";
import { OIDC_AUTH } from "consts/oidc";
import { OIDC_STATE_EXPIRED } from "consts/redis";
import app from "core-kit/packages/server";
import { createLogger } from "core-kit/packages/logger";
import { OidcSignInError, signInWithOidc } from "packages/users/oidc-sign-in";
import { redirect } from "../utils";
import { authorizationUrl, exchangeCode } from "./client";

const logger = createLogger("oidc");

const STATE_COOKIE = "oidc_state";
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: BASE_URL.startsWith("https:"),
  path: "/",
};

function loginError(err: unknown): string {
  const code = err instanceof OidcSignInError ? err.code : "sso_failed";
  return `/en/login?error=${code}`;
}

if (OIDC_AUTH) {
  app.get("/oidc", async (req, res) => {
    try {
      const { url, state } = await authorizationUrl();
      res.cookie(STATE_COOKIE, state, {
        ...STATE_COOKIE_OPTIONS,
        maxAge: OIDC_STATE_EXPIRED * 1000,
      });
      res.redirect(url);
    } catch (err) {
      logger.error(err);
      res.redirect(loginError(err));
    }
  });

  app.get("/oidc/callback", async (req, res) => {
    const browserState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, STATE_COOKIE_OPTIONS);
    try {
      const [, query = ""] = req.originalUrl.split("?");
      const claims = await exchangeCode(query, browserState);
      const authorization = await signInWithOidc(claims);
      res.status(200).send(redirect(authorization));
    } catch (err) {
      logger.warn(err);
      res.redirect(loginError(err));
    }
  });
}
