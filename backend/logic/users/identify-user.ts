import { Authorization } from "api/users/models/authorization";
import { FatalError, NotFoundError } from "core-kit/types/errors";
import { toModel, toPlain } from "core-kit/utils/models";
import { ulid } from "ulid";
import { sid } from "utils/string";
import mongo from "../../app/mongo";
import { User } from "../../models/user";
import { getToken } from "./auth";

const MAX_ATTEMPTS = 5;

export async function identify(
  email: string,
  username?: string
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
    let ids = [
      (() => {
        const [name] = email.split("@");
        return name;
      })(),
    ];
    if (!!username) {
      ids.push(username);
    }
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      ids.push([username, sid(2)].join(""));
    }

    for (let i = 0; i < ids.length; i++) {
      let _id = ids[i];

      user = new User({
        _id,
        email,
        createdAt: now,
        cursor: ulid(),
      });
      try {
        await mongo.users.insertOne(toPlain(user) as { _id: string });
      } catch (err) {
        if (err?.code === 11000 && i < ids.length - 1) {
          continue;
        }

        throw new FatalError("Can't create user");
      }
    }
  }

  return new Authorization({ token: getToken(user), user });
}
