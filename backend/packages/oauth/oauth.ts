import "reflect-metadata";

import { BASE_URL } from "consts/core";
import env from "core-kit/env";
import app from "core-kit/packages/server";
import { toInstance } from "core-kit/packages/transform";
import cors from "cors";
import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { OAuthProfile } from "./models";

app.use(cors({ credentials: true }));
app.use(express.json());
app.use(passport.initialize());

export default app;
