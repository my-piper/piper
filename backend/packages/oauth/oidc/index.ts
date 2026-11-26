import { OIDC_AUTH } from "consts/oidc";
import app from "core-kit/packages/server";
import { createLogger } from "core-kit/packages/logger";
import { OidcSignInError, signInWithOidc } from "packages/users/oidc-sign-in";
import { redirect } from "../utils";
import { authorizationUrl, exchangeCode } from "./client";

const logger = createLogger("oidc");

function loginError(err: unknown): string {
  const code = err instanceof OidcSignInError ? err.code : "sso_failed";
  return `/en/login?error=${code}`;
}

if (OIDC_AUTH) {
  app.get("/oidc", async (req, res) => {
    try {
      res.redirect(await authorizationUrl());
    } catch (err) {
      logger.error(err);
      res.redirect(loginError(err));
    }
  });

  app.get("/oidc/callback", async (req, res) => {
    try {
      const [, query = ""] = req.originalUrl.split("?");
      const authorization = await signInWithOidc(await exchangeCode(query));
      res.status(200).send(redirect(authorization));
    } catch (err) {
      logger.warn(err);
      res.redirect(loginError(err));
    }
  });
}
