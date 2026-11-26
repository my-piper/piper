import api from "app/api";
import { OIDC_AUTH, OIDC_COOKIE_OPTIONS, OIDC_LINK_COOKIE } from "consts/oidc";
import { OIDC_LINK_EXPIRED, OIDC_LINK_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { DataError } from "core-kit/types/errors";
import { randomBytes } from "node:crypto";
import { checkLogged, handle } from "utils/http";

// The browser then opens `/oauth/oidc?link`: the oauth process has no user
// token, so the ticket, kept in an HttpOnly cookie of this browser, tells it
// which user to connect.
api.post(
  "/api/me/identities/oidc/link",
  handle(({ currentUser }) => async (req, res) => {
    checkLogged(currentUser);
    if (!OIDC_AUTH) {
      throw new DataError("Single sign-on is disabled");
    }

    const ticket = randomBytes(32).toString("base64url");
    await redis.setEx(
      OIDC_LINK_KEY(ticket),
      OIDC_LINK_EXPIRED,
      currentUser._id
    );
    res.cookie(OIDC_LINK_COOKIE, ticket, {
      ...OIDC_COOKIE_OPTIONS,
      maxAge: OIDC_LINK_EXPIRED * 1000,
    });
    return null;
  })
);
