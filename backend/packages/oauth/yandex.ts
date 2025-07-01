import env from "core-kit/env";
import "reflect-metadata";

import { BASE_URL } from "consts/core";
import app from "core-kit/packages/server";
import { toInstance } from "core-kit/packages/transform";
import { identify } from "packages/users/identify-user";
import passport from "passport";
import { Strategy as YandexStrategy } from "passport-yandex";
import { OAuthProfile, User } from "./models";
import { redirect } from "./utils";

const CLIENT_ID = env["YANDEX_CLIENT_ID"] || "xyzYYZ";
const CLIENT_SECRET = env["YANDEX_CLIENT_SECRET"] || "xyzYYZ";

passport.use(
  new YandexStrategy(
    {
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: [BASE_URL, "oauth/yandex/callback"].join("/"),
    },
    (accessToken: string, refreshToken: string, profile: object, done) => {
      const {
        username,
        emails: [{ value: email }],
      } = toInstance(profile, OAuthProfile);
      return done(null, { username, email });
    }
  )
);

app.get("/yandex", passport.authenticate("yandex"));
app.get(
  "/yandex/callback",
  passport.authenticate("yandex", { session: false }),
  async (req, res) => {
    const { email } = req["user"] as User;
    res.status(200).send(redirect(await identify(email, "yandex")));
  }
);
