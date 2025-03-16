import { JWT_EXPIRES, JWT_SECRET } from "consts/core";
import { toPlain } from "core-kit/utils/models";
import jwt from "jsonwebtoken";
import { User } from "models/user";

export function getToken(user: User): string {
  return jwt.sign(toPlain(user), JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
  });
}
