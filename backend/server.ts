import "core-kit/env";
import "reflect-metadata";

import api from "app/api";
import { Expose, Type } from "class-transformer";
import { BILLING_URL } from "consts/billing";
import { createLogger } from "core-kit/services/logger";
import sentry from "core-kit/services/sentry";
import { toInstance, toPlain } from "core-kit/utils/models";
import express from "express";
import { readFile } from "fs/promises";
import assign from "lodash/assign";
import path from "path";

import "reflect-metadata";
import "./api/artefacts";
import "./api/assets";
import "./api/balance-refills";
import "./api/batches";
import "./api/dms";
import "./api/environment";
import "./api/launches";
import "./api/me";
import "./api/messages";
import "./api/nodes";
import "./api/pipeline-usages";
import "./api/pipelines";
import "./api/projects";
import "./api/users";
import "./api/utils";

import "./api/deploys";

import {
  BASE_URL,
  FRONTEND_ROOT,
  LANGUAGES,
  NODE_ENV,
  SITE_URL,
} from "./consts/core";
import { NO_CACHE_HEADERS } from "./consts/http";
import { AppConfig } from "./models/app-config";
import { handle } from "./utils/http";

const logger = createLogger("server");

export class Prerender {
  @Expose()
  @Type(() => AppConfig)
  config?: AppConfig;

  constructor(defs: Partial<Prerender> = {}) {
    assign(this, defs);
  }
}

if (NODE_ENV === "production") {
  api.use(express.static(FRONTEND_ROOT));
  api.get(
    `/:lang(${LANGUAGES.join("|")})/**`,
    handle(() => async ({ params: { lang } }, res) => {
      const index = path.join(process.cwd(), FRONTEND_ROOT, lang, "index.html");
      let output = await readFile(index, "utf-8");
      const prerender = toInstance(
        {
          config: {
            billing: {
              url: BILLING_URL,
            },
            baseUrl: BASE_URL,
            siteUrl: SITE_URL,
          },
        },
        Prerender
      );
      output = output.replace(
        "PRERENDER = {};",
        `PRERENDER = ${JSON.stringify(toPlain(prerender))}`
      );
      res.set(NO_CACHE_HEADERS);
      res.send(output);
    })
  );
  api.get(
    "/",
    handle(({ language }) => async (req, res) => {
      res.set(NO_CACHE_HEADERS);
      res.redirect(`/${language}/`);
    })
  );
  api.get(
    "*",
    handle(({ language }) => async ({ originalUrl }, res) => {
      res.set(NO_CACHE_HEADERS);
      res.redirect(`/${language}${originalUrl}`);
    })
  );
}

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception");
  logger.error(error);
  sentry.captureException(error);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection");
  logger.error(reason);
  sentry.captureException(reason);
});

export const PORT =
  (() => {
    const port = process.env["SERVER_PORT"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 80;

api.listen(PORT, () => {
  logger.debug("Server is running");
});
