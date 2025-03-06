import bcrypt from "bcrypt";
import { toInstance, toPlain } from "core-kit/utils/models";
import assign from "lodash/assign";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import ajv from "../../lib/ajv";
import { User } from "../../models/user";
import SCHEMAS from "../../schemas/compiled.json" with { type: "json" };
import { DataError } from "../../types/errors";
import { checkAdmin, handle } from "../../utils/http";

api.patch(
  "/api/users/:_id",
  handle(({ currentUser }) => async ({ params: { _id }, body }) => {
    checkAdmin(currentUser);

    const request = toInstance(body, User);
    const validate = ajv.compile(SCHEMAS.user);
    if (!validate(request)) {
      const { errors } = validate;
      throw new DataError(
        "User schema invalid",
        errors.map((e) => `${e.propertyName || e.instancePath}: ${e.message}`)
      );
    }

    const update = new User(request);

    const { password } = update;
    if (!!password) {
      assign(update, { password: await bcrypt.hash(password, 10) });
    }

    await mongo.users.updateOne(
      { _id },
      {
        $set: toPlain(update),
      }
    );
    return toPlain(update);
  })
);
