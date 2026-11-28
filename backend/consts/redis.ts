import "core-kit/env";

import { secondsInDay as SECONDS_IN_DAY } from "date-fns";

const KEY_SEPARATOR = ":";

export const REDIS_SECRET_KEY = process.env["REDIS_SECRET_KEY"] || "xyzXYZ";

export const DEPLOY = (slug: string, prefix: string = null) =>
  ["deploy", ...(prefix ? [prefix] : []), slug].join(KEY_SEPARATOR);

// A Launch's live state keys live in packages/launches/live-state/keys.ts.

export const GLOBAL_ENVIRONMENT_KEY = "environment";
/**
 * Legacy User Environments, read only by `env migrate-user-environments`;
 * remove together with that command.
 */
export const LEGACY_USER_ENVIRONMENT_PREFIX = "environment:";

export const USER_API_TOKEN_KEY = (id: string) => `user:${id}:api-token`;
export const USER_API_TOKEN_EXPIRED = 5 * 365 * SECONDS_IN_DAY;

export const OIDC_STATE_KEY = (state: string) => `oidc:state:${state}`;
export const OIDC_STATE_EXPIRED = 10 * 60;

/** Single-use ticket that lets the oauth process bind an identity to a user. */
export const OIDC_LINK_KEY = (ticket: string) => `oidc:link:${ticket}`;
export const OIDC_LINK_EXPIRED = 5 * 60;
