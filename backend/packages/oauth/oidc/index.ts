import {
  OIDC_AUTH,
  OIDC_COOKIE_OPTIONS,
  OIDC_LINK_COOKIE,
  OIDC_STATE_COOKIE,
} from "consts/oidc";
import { OIDC_STATE_EXPIRED } from "consts/redis";
import app from "core-kit/packages/server";
import { createLogger } from "core-kit/packages/logger";
import { bindOidcIdentity } from "packages/users/oidc-bind";
import { OidcSignInError, signInWithOidc } from "packages/users/oidc-sign-in";
import { redirect } from "../utils";
import { authorizationUrl, exchangeCode } from "./client";

const logger = createLogger("oidc");

function errorCode(err: unknown): string {
  return err instanceof OidcSignInError ? err.code : "sso_failed";
}

function loginError(err: unknown): string {
  return `/en/login?error=${errorCode(err)}`;
}

/** Where a signed-in user lands after connecting an identity. */
function linkResult(result: string): string {
  // The app's root redirect drops the query, so land on a real page.
  return `/en/projects?sso=${result}`;
}

if (OIDC_AUTH) {
  app.get("/oidc", async (req, res) => {
    // The link ticket comes only from the cookie the link endpoint set in this
    // browser, never from the URL: a link sent by someone else can't bind the
    // visitor's provider account to the sender's Piper account.
    const linking = "link" in req.query;
    const ticket = linking ? (req.cookies?.[OIDC_LINK_COOKIE] ?? "") : null;
    if (linking) {
      res.clearCookie(OIDC_LINK_COOKIE, OIDC_COOKIE_OPTIONS);
    }
    try {
      if (linking && !ticket) {
        throw new OidcSignInError("sso_failed", "No link ticket cookie");
      }
      const { url, state } = await authorizationUrl(ticket ?? undefined);
      res.cookie(OIDC_STATE_COOKIE, state, {
        ...OIDC_COOKIE_OPTIONS,
        maxAge: OIDC_STATE_EXPIRED * 1000,
      });
      res.redirect(url);
    } catch (err) {
      logger.error(err);
      res.redirect(linking ? linkResult(errorCode(err)) : loginError(err));
    }
  });

  app.get("/oidc/callback", async (req, res) => {
    const browserState = req.cookies?.[OIDC_STATE_COOKIE];
    res.clearCookie(OIDC_STATE_COOKIE, OIDC_COOKIE_OPTIONS);
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
