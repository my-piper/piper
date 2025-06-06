import env from "core-kit/env";
import "reflect-metadata";

import { Authorization } from "api/users/models/authorization";
import { BASE_URL } from "consts/core";
import { createLogger } from "core-kit/packages/logger";
import app from "core-kit/packages/server";
import { Expose, toInstance, toPlain, Type } from "core-kit/packages/transform";
import cors from "cors";
import express from "express";
import { identify } from "logic/users/identify-user";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as YandexStrategy } from "passport-yandex";

const logger = createLogger("oauth");

app.use(cors({ credentials: true }));
app.use(express.json());
app.use(passport.initialize());

function redirect(authorization: Authorization) {
  return `
  <html>
          <head>
          <title>Redirecting...</title>
          </head>
          <body>
              <script>
                  localStorage.setItem('authorization', '${JSON.stringify(toPlain(authorization))}');
                  setTimeout(()=> location.href = '/', 1000);
              </script>
              <p>Redirecting...</p>
          </body>
  </html>
  `;
}

// Google

const GOOGLE_CLIENT_ID = env["GOOGLE_CLIENT_ID"] || "xyzYYZ";
const GOOGLE_CLIENT_SECRET = env["GOOGLE_CLIENT_SECRET"] || "xyzYYZ";

type User = {
  username: string;
  email: string;
};

class OAuthEmail {
  @Expose()
  @Type(() => String)
  value: string;
}

class OAuthProfile {
  @Expose()
  @Type(() => String)
  username: string;

  @Expose()
  @Type(() => OAuthEmail)
  emails: OAuthEmail[];
}

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/oauth/google/callback`,
    },
    (accessToken: string, refreshToken: string, profile: object, done) => {
      const {
        emails: [{ value: email }],
      } = toInstance(profile, OAuthProfile);
      return done(null, { email });
    }
  )
);

app.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
app.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    const { email } = req["user"] as User;
    res.status(200).send(redirect(await identify(email, "google")));
  }
);

// Yandex

const YANDEX_CLIENT_ID = env["YANDEX_CLIENT_ID"] || "xyzYYZ";
const YANDEX_CLIENT_SECRET = env["YANDEX_CLIENT_SECRET"] || "xyzYYZ";

passport.use(
  new YandexStrategy(
    {
      clientID: YANDEX_CLIENT_ID,
      clientSecret: YANDEX_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/oauth/yandex/callback`,
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

const PORT =
  (() => {
    const port = env["OAUTH_PORT"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 80;

app.listen(PORT, () => {
  logger.debug("Server is running");
});
