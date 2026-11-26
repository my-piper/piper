import mongo from "app/mongo";
import bcrypt from "bcrypt";
import { JWT_SECRET } from "consts/core";
import { USER_API_TOKEN_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance } from "core-kit/packages/transform";
import { DataError, NotFoundError } from "core-kit/types/errors";
import jwt from "jsonwebtoken";
import { User } from "models/user";

const USER_PROJECTION = { _id: 1, email: 1, roles: 1, createdAt: 1 };

export type Credentials = {
  userToken?: string;
  apiToken?: string;
};

export type TokenKind = keyof Credentials;

// Thrown when a token is present but does not identify a user, so callers can
// tell which credential was wrong.
export class WrongTokenError extends Error {
  constructor(
    readonly kind: TokenKind,
    cause: unknown
  ) {
    super(kind === "apiToken" ? "Wrong API token" : "Wrong user token", {
      cause,
    });
  }
}

// The user behind a user token or an API token; undefined when neither is
// given. The API token wins when both are given, like it does over HTTP.
export async function resolveUser({
  userToken,
  apiToken,
}: Credentials): Promise<User | undefined> {
  let user: User | undefined;
  if (userToken) {
    user = await fromUserToken(userToken);
  }
  if (apiToken) {
    user = await fromApiToken(apiToken);
  }
  return user;
}

async function fromUserToken(token: string): Promise<User> {
  try {
    return await findUser(userId(token));
  } catch (err) {
    throw new WrongTokenError("userToken", err);
  }
}

async function fromApiToken(token: string): Promise<User> {
  try {
    const _id = userId(token);

    const hash = await redis.get(USER_API_TOKEN_KEY(_id));
    if (!hash) {
      throw new DataError("API hash is not found");
    }
    if (!(await bcrypt.compare(token, hash))) {
      throw new DataError("API token is invalid");
    }

    return await findUser(_id);
  } catch (err) {
    throw new WrongTokenError("apiToken", err);
  }
}

function userId(token: string): string {
  const decoded = jwt.verify(token, JWT_SECRET);
  return toInstance(decoded as object, User)._id;
}

async function findUser(_id: string): Promise<User> {
  const user = await mongo.users.findOne(
    { _id },
    { projection: USER_PROJECTION }
  );
  if (!user) {
    throw new NotFoundError();
  }
  return toInstance(user, User);
}
