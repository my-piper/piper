import api from "app/api";
import mongo from "app/mongo";
import bcrypt from "bcrypt";
import { INITIAL_USER_BALANCE } from "consts/billing";
import {
  USER_INITIAL_BALANCE_LOCK,
  USER_INITIAL_BALANCE_LOCK_EXPIRED,
} from "consts/redis";
import { ALLOW_SIGNUP } from "consts/ui";
import { getLabel } from "core-kit/packages/i18n";
import { sendEmail } from "core-kit/packages/mailer";
import { handlebars, markdown } from "core-kit/packages/templates";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { readFile } from "fs/promises";
import assign from "lodash/assign";
import { User } from "models/user";
import { getToken } from "packages/users/auth";
import { refillBalance } from "packages/users/refill-balance";
import { ulid } from "ulid";
import { handle } from "utils/http";
import { lock, locked } from "utils/redis";
import { sid } from "utils/string";
import { Authorization } from "./models/authorization";
import { SignupRequest } from "./models/signup-request";

api.post(
  "/api/signup",
  handle(({ language, ip }) => async ({ body }) => {
    if (!ALLOW_SIGNUP) {
      throw new DataError("Signup has been disabled");
    }

    const request = toInstance(body as Object, SignupRequest);
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
      const refillKey = USER_INITIAL_BALANCE_LOCK(ip);
      const refilled = await locked(refillKey);
      if (!refilled) {
        await refillBalance(_id, INITIAL_USER_BALANCE);
        await lock(refillKey, USER_INITIAL_BALANCE_LOCK_EXPIRED);
      }
    }

    return toPlain(new Authorization({ token: getToken(user), user }));
  })
);
