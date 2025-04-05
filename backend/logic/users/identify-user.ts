import { Authorization } from "api/users/models/authorization";
import mongo from "app/mongo";
import { INITIAL_USER_BALANCE } from "consts/billing";
import { FatalError, NotFoundError } from "core-kit/types/errors";
import { toModel, toPlain } from "core-kit/utils/models";
import { ulid } from "ulid";
import { sid } from "utils/string";
import { User } from "../../models/user";
import { getToken } from "./auth";
import { refillBalance } from "./refill-balance";
import { OAuthProvider } from "./types";

const MAX_ATTEMPTS = 5;

export async function identify(
  email: string,
  provider: OAuthProvider
): Promise<Authorization> {
  const now = new Date();

  let user: User;
  try {
    user = toModel(
      await mongo.users.findOne(
        {
          email,
        },
        { projection: { _id: 1, email: 1 } }
      ),
      User
    );
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }
  }

  if (!user) {
    const [username] = email.split("@");
    let ids = [username];
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      ids.push([username, sid(2)].join(""));
    }

    for (let i = 0; i < ids.length; i++) {
      let _id = ids[i];

      user = new User({
        _id,
        email,
        createdAt: now,
        provider,
        cursor: ulid(),
      });
      try {
        await mongo.users.insertOne(toPlain(user) as { _id: string });
        break;
      } catch (err) {
        if (err?.code === 11000 && i < ids.length - 1) {
          continue;
        }

        throw new FatalError("Can't create user");
      }
    }

    if (INITIAL_USER_BALANCE > 0) {
      await refillBalance(user._id, INITIAL_USER_BALANCE);
    }
  }

  return new Authorization({ token: getToken(user), user });
}
