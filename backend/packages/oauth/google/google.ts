import "reflect-metadata";

import { BASE_URL } from "consts/core";
import app from "core-kit/packages/server";
import { toInstance } from "core-kit/packages/transform";
import { identify } from "packages/users/identify-user";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { OAuthProfile, User } from "../models";
import { redirect } from "../utils";
import { CLIENT_ID, CLIENT_SECRET } from "./consts";

passport.use(
  new GoogleStrategy(
    {
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: [BASE_URL, "oauth/google/callback"].join("/"),
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
