import { BASE_URL } from "consts/core";
import { OIDC_AUTH } from "consts/oidc";
import { OIDC_STATE_EXPIRED } from "consts/redis";
import app from "core-kit/packages/server";
import { createLogger } from "core-kit/packages/logger";
import { bindOidcIdentity } from "packages/users/oidc-bind";
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

function errorCode(err: unknown): string {
  return err instanceof OidcSignInError ? err.code : "sso_failed";
}

function loginError(err: unknown): string {
  return `/en/login?error=${errorCode(err)}`;
}

/** Where a signed-in user lands after connecting an identity. */
function linkResult(result: string): string {
  return `/en/?sso=${result}`;
}

if (OIDC_AUTH) {
  app.get("/oidc", async (req, res) => {
    const link = typeof req.query.link === "string" ? req.query.link : null;
    try {
      const { url, state } = await authorizationUrl(link ?? undefined);
      res.cookie(STATE_COOKIE, state, {
        ...STATE_COOKIE_OPTIONS,
        maxAge: OIDC_STATE_EXPIRED * 1000,
      });
      res.redirect(url);
    } catch (err) {
      logger.error(err);
      res.redirect(link ? linkResult(errorCode(err)) : loginError(err));
    }
  });

  app.get("/oidc/callback", async (req, res) => {
    const browserState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, STATE_COOKIE_OPTIONS);
    try {
      const [, query = ""] = req.originalUrl.split("?");
      const { claims, userId } = await exchangeCode(query, browserState);
      if (userId) {
        try {
          await bindOidcIdentity(userId, claims);
        } catch (err) {
          logger.warn(err);
          return res.redirect(linkResult(errorCode(err)));
        }
        return res.redirect(linkResult("linked"));
      }

      const authorization = await signInWithOidc(claims);
      res.status(200).send(redirect(authorization));
    } catch (err) {
      logger.warn(err);
      res.redirect(loginError(err));
    }
  });
}
