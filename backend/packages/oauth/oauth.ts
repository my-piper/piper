import "reflect-metadata";

import app from "core-kit/packages/server";
import cors from "cors";
import express from "express";
import passport from "passport";

app.use(cors({ credentials: true }));
app.use(express.json());
app.use(passport.initialize());

export default app;
