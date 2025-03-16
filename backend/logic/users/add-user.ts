import bcrypt from "bcrypt";
import { DataError } from "core-kit/types/errors";
import { toInstance, toPlain } from "core-kit/utils/models";
import assign from "lodash/assign";
import { ulid } from "ulid";
import mongo from "../../app/mongo";
import ajv from "../../lib/ajv";
import { User } from "../../models/user";
import SCHEMAS from "../../schemas/compiled.json" with { type: "json" };

export async function add(data: Partial<User>): Promise<User> {
  const user = toInstance(data, User);
  const validate = ajv.compile(SCHEMAS.user);
  if (!validate(user)) {
    const { errors } = validate;
    throw new DataError(
      "User schema invalid",
      errors.map((e) => `${e.propertyName || e.instancePath}: ${e.message}`)
    );
  }

  const { password } = user;
  if (!!password) {
    assign(user, { password: await bcrypt.hash(password, 10) });
  }

  assign(user, {
    createdAt: new Date(),
    cursor: ulid(),
  });

  try {
    await mongo.users.insertOne(toPlain(user) as { _id: string });
  } catch (err) {
    if (err?.code === 11000) {
      throw new DataError("User exists");
    }

    throw err;
  }

  return user;
}
