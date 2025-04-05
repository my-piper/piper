import api from "app/api";
import mongo from "app/mongo";
import bcrypt from "bcrypt";
import { plainToInstance } from "class-transformer";
import { INITIAL_USER_BALANCE } from "consts/billing";
import { sendEmail } from "core-kit/services/mailer";
import { handlebars, markdown } from "core-kit/services/templates";
import { DataError } from "core-kit/types/errors";
import { getLabel } from "core-kit/utils/i18n";
import { toPlain, validate } from "core-kit/utils/models";
import { readFile } from "fs/promises";
import assign from "lodash/assign";
import { getToken } from "logic/users/auth";
import { refillBalance } from "logic/users/refill-balance";
import { ulid } from "ulid";
import { handle } from "utils/http";
import { sid } from "utils/string";
import { User } from "../../models/user";
import { Authorization } from "./models/authorization";
import { SignupRequest } from "./models/signup-request";

api.post(
  "/api/signup",
  handle(({ language }) => async ({ body }) => {
    const request = plainToInstance(SignupRequest, body as Object);
    await validate(request);

    const { email, login: _id } = request;

    const now = new Date();
    const user = new User({
      _id,
      email,
      createdAt: now,
      cursor: ulid(),
    });

    const actions: (() => Promise<void>)[] = [];

    let { password } = request;
    if (!password) {
      password = sid();
      actions.push(async (): Promise<void> => {
        const subject = getLabel("en=Your password;ru=Ваш пароль", language);
        const template = markdown(
          await readFile("./emails/your-password.txt", "utf-8"),
          language
        );

        const message = await (async () => {
          const message = handlebars(template, { password });
          const common = await readFile("./emails/common.html", "utf-8");
          return handlebars(common, { message });
        })();
        sendEmail(email, subject, message);
      });
    }

    assign(user, {
      password: await bcrypt.hash(password, 10),
    });

    try {
      await mongo.users.insertOne(toPlain(user) as { _id: string });
    } catch (err) {
      if (err?.code === 11000) {
        throw new DataError("User exists");
      }

      throw err;
    }

    await Promise.all(actions.map((action) => action()));

    if (INITIAL_USER_BALANCE > 0) {
      await refillBalance(_id, INITIAL_USER_BALANCE);
    }

    return toPlain(new Authorization({ token: getToken(user), user }));
  })
);
