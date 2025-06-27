import env from "core-kit/env";
import "reflect-metadata";

import api from "app/api";

import { BILLING_URL } from "consts/billing";
import { createLogger } from "core-kit/packages/logger";
import sentry from "core-kit/packages/sentry";
import { Expose, toInstance, toPlain, Type } from "core-kit/packages/transform";
import express from "express";
import { readFile } from "fs/promises";
import assign from "lodash/assign";
import path from "path";
import { parseURL } from "ufo";

import "./api/artefacts";
import "./api/assets";
import "./api/balance-refills";
import "./api/batches";
import "./api/dms";
import "./api/environment";
import "./api/launches";
import "./api/me";
import "./api/messages";
import "./api/node-packages";
import "./api/nodes";
import "./api/pipeline-usages";
import "./api/pipelines";
import "./api/projects";
import "./api/users";
import "./api/utils";

import "./api/deploys";

import { ALLOW_SIGNUP, APP_FOOTER, GOOGLE_AUTH, YANDEX_AUTH } from "consts/ui";
import { ALL_LANGUAGES } from "core-kit/packages/locale";
import { BASE_URL, FRONTEND_ROOT, SITE_URL } from "./consts/core";
import { NO_CACHE_HEADERS, SCP_HEADERS } from "./consts/http";
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

const STATIC_FILE_EXT =
  /\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|ico|webp|webm|mp3|mp4|wav|txt|html|json|md)$/;

api.use((req, res, next) => {
  if (STATIC_FILE_EXT.test(req.path)) {
    res.set(SCP_HEADERS);
    return express.static(FRONTEND_ROOT, { etag: false })(req, res, next);
  }
  next();
});

api.get(
  `/:language(${ALL_LANGUAGES.join("|")})/*`,
  handle(() => async ({ originalUrl, params: { language } }, res) => {
    res.set(NO_CACHE_HEADERS);
    res.set(SCP_HEADERS);
    const slug = language.toLowerCase();
    if (language !== slug) {
      const { pathname, search } = parseURL(originalUrl);
      const redirect = pathname.toLocaleLowerCase() + (search || "");
      return res.redirect(301, redirect);
    }

    const index = path.join(
      process.cwd(),
      FRONTEND_ROOT,
      language,
      "index.html"
    );
    let output = await readFile(index, "utf-8");
    const prerender = toInstance(
      {
        config: {
          billing: {
            url: BILLING_URL,
          },
          ui: {
            features: [
              ...(ALLOW_SIGNUP ? ["signup"] : []),
              ...(GOOGLE_AUTH ? ["google_auth"] : []),
              ...(YANDEX_AUTH ? ["yandex_auth"] : []),
            ],
            appFooter: APP_FOOTER,
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
    const port = env["SERVER_PORT"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 80;

api.listen(PORT, () => {
  logger.debug("Server is running");
});
