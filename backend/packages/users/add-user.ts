import ajv from "app/ajv";
import mongo from "app/mongo";
import bcrypt from "bcrypt";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import assign from "lodash/assign";
import { User } from "models/user";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import { ulid } from "ulid";

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
