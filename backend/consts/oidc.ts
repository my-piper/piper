import env from "core-kit/env";
import { BASE_URL } from "./core";

export const OIDC_AUTH = env["OIDC_AUTH"] === "yes";
export const OIDC_ISSUER = env["OIDC_ISSUER"] || "";
export const OIDC_CLIENT_ID = env["OIDC_CLIENT_ID"] || "";
export const OIDC_CLIENT_SECRET = env["OIDC_CLIENT_SECRET"] || "";
export const OIDC_LABEL = env["OIDC_LABEL"] || "SSO";

export const OIDC_CALLBACK_URL = [BASE_URL, "oauth/oidc/callback"].join("/");
export const OIDC_SCOPE = "openid email profile";

/** Cookies that tie a flow to the browser which started it. */
export const OIDC_STATE_COOKIE = "oidc_state";
export const OIDC_LINK_COOKIE = "oidc_link";
export const OIDC_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: BASE_URL.startsWith("https:"),
  path: "/",
};
