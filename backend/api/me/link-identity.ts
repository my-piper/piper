import api from "app/api";
import { OIDC_AUTH } from "consts/oidc";
import { OIDC_LINK_EXPIRED, OIDC_LINK_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { randomBytes } from "node:crypto";
import { checkLogged, handle } from "utils/http";
import { IdentityLinkTicket } from "./models/identity-link-ticket";

// The browser then opens `/oauth/oidc?link=<ticket>`: the oauth process has
// no user token, so the ticket tells it which user to connect.
api.post(
  "/api/me/identities/oidc/link",
  handle(({ currentUser }) => async () => {
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
    return toPlain(new IdentityLinkTicket({ ticket }));
  })
);
