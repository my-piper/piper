import api from "app/api";
import mongo from "app/mongo";
import axios from "axios";
import bcrypt from "bcrypt";
import { INITIAL_USER_BALANCE } from "consts/billing";
import { CAPTCHA_REQUIRED, CAPTCHA_SECRET } from "consts/captcha";
import {
  USER_INITIAL_BALANCE_LOCK,
  USER_INITIAL_BALANCE_LOCK_EXPIRED,
} from "consts/redis";
import { ALLOW_SIGNUP } from "consts/ui";
import { getLabel } from "core-kit/packages/i18n";
import { createLogger } from "core-kit/packages/logger";
import { sendEmail } from "core-kit/packages/mailer";
import redis, { lock, locked } from "core-kit/packages/redis";
import { handlebars, markdown } from "core-kit/packages/templates";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { readFile } from "fs/promises";
import { User } from "models/user";
import { getToken } from "packages/users/auth";
import { refillBalance } from "packages/users/refill-balance";
import { ulid } from "ulid";
import { handle } from "utils/http";
import { sid } from "utils/string";
import { Authorization } from "./models/authorization";
import { ConfirmEmailRequest, SignupRequest } from "./models/signup-request";

const logger = createLogger("signup");

const CONFIRMATION_CODE_KEY = (email: string) =>
  ["confirmation-code", email].join(":");
const CONFIRMATION_CODE_EXPIRE = 300;

api.post(
  "/api/signup",
  handle(({ ip }) => async ({ body }) => {
    if (!ALLOW_SIGNUP) {
      throw new DataError("Signup has been disabled");
    }

    const request = toInstance(body as Object, SignupRequest);
    await validate(request);

    const { email, login: _id, password, code } = request;

    if (code !== (await redis.get(CONFIRMATION_CODE_KEY(email)))) {
      throw new DataError("Wrong confirmation code");
    }

    if (email.indexOf("+") !== -1) {
      throw new DataError("Try another email");
    }

    const {
      data: { status },
    } = await axios({
      method: "get",
      url: "https://rapid-email-verifier.fly.dev/api/validate",
      params: {
        email,
      },
    });
    if (status !== "VALID") {
      throw new DataError("Try another email");
    }

    const now = new Date();
    const user = new User({
      _id,
      email,
      password: await bcrypt.hash(password, 10),
      createdAt: now,
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

api.post(
  "/api/signup/confirm",
  handle(({ language, ip }) => async ({ body }) => {
    if (!ALLOW_SIGNUP) {
      throw new DataError("Signup has been disabled");
    }

    const request = toInstance(body as Object, ConfirmEmailRequest);
    await validate(request);

    const { email, captcha } = request;

    if (CAPTCHA_REQUIRED) {
      let success = false;
      try {
        const { data: response } = await axios({
          method: "POST",
          url: "https://hcaptcha.com/siteverify",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          data: new URLSearchParams({
            response: captcha,
            secret: CAPTCHA_SECRET,
            remoteip: ip,
          }),
        });
        logger.debug(JSON.stringify(response));
        success = response.success;
      } catch (e) {
        logger.error(e);
        throw new DataError("Can't check captcha");
      }
      if (!success) {
        throw new DataError("Wrong captcha");
      }
    }

    const subject = getLabel("en=Your code;ru=Ваш код", language);
    const template = markdown(
      await readFile("./emails/confirmation.txt", "utf-8"),
      language
    );

    const code = sid();

    await redis.setEx(
      CONFIRMATION_CODE_KEY(email),
      CONFIRMATION_CODE_EXPIRE,
      code
    );

    const message = await (async () => {
      const message = handlebars(template, { code });
      const common = await readFile("./emails/common.html", "utf-8");
      return handlebars(common, { message });
    })();
    sendEmail(email, subject, message);

    return null;
  })
);
