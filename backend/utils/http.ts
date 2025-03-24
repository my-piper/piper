import bcrypt from "bcrypt";
import { USER_API_TOKEN_KEY } from "consts/redis";
import { Languages } from "core-kit/enums/languages";
import { redis } from "core-kit/services/redis";
import {
  DataError,
  NotFoundError,
  PenTestingError,
  TooManyRequestsError,
  UnauthorizedError,
} from "core-kit/types/errors";
import { toInstance, toPlain } from "core-kit/utils/models";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import assign from "lodash/assign";
import mongo from "../app/mongo";
import { DEFAULT_LANG, JWT_SECRET, LANGUAGES } from "../consts/core";
import { NO_CACHE_HEADERS } from "../consts/http";
import { createLogger } from "../logger";
import { User, UserRole } from "../models/user";
import { Injector } from "../types/injector";

const USER_TOKEN_HEADER = "user-token";
const API_TOKEN_HEADER = "api-token";
const LANGUAGE_HEADER = "accept-language";

const logger = createLogger("process-node");

export type ApiHandler = (
  injector: Injector
) => (
  req: Request,
  res?: Response
) => void | Promise<void | string | number | object>;

export const handle =
  (handler: ApiHandler) => async (req: Request, res: Response) => {
    const injector: Injector = {
      language: DEFAULT_LANG,
    };

    logger.debug(`Process ${req.method}: ${req.path}`);

    {
      const language = (() => {
        const header = req.headers[LANGUAGE_HEADER]?.split(",")[0] as Languages;
        if (!!header && LANGUAGES.includes(header)) {
          return header;
        }
        return null;
      })();
      if (!!language) {
        assign(injector, { language });
      }
    }

    {
      const header = req.headers[USER_TOKEN_HEADER];
      if (!!header) {
        const token = header as string;
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          const { _id } = toInstance(decoded as Object, User);
          const user = toModel(
            await mongo.users.findOne(
              { _id },
              {
                projection: {
                  _id: 1,
                  email: 1,
                  roles: 1,
                  balance: 1,
                  createdAt: 1,
                },
              }
            ),
            User
          );
          assign(injector, { currentUser: user });
        } catch (err) {
          console.error(err);
          res.status(401).send("Wrong user token");
          return;
        }
      }
    }

    {
      const header = req.headers[API_TOKEN_HEADER];
      if (!!header) {
        const token = header as string;
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          const { _id } = toInstance(decoded as Object, User);

          {
            const hash = await redis.get(USER_API_TOKEN_KEY(_id));
            if (!hash) {
              throw new DataError("API hash is not found");
            }

            console.log(hash);

            const matched = await bcrypt.compare(token, hash);
            if (!matched) {
              throw new DataError("API token is invalid");
            }
          }

          const user = toModel(
            await mongo.users.findOne(
              { _id },
              {
                projection: {
                  _id: 1,
                  email: 1,
                  roles: 1,
                  balance: 1,
                  createdAt: 1,
                },
              }
            ),
            User
          );
          assign(injector, { currentUser: user });
        } catch (err) {
          console.error(err);
          res.status(401).send("Wrong API token");
          return;
        }
      }
    }

    try {
      const answer = await handler(injector)(req, res);
      if (answer === null) {
        logger.debug("No answer");
        res.status(204).send();
      } else if (answer !== undefined) {
        logger.debug("Send answer");
        res.set(NO_CACHE_HEADERS);
        !!answer ? res.status(200).send(answer) : res.status(204).send();
      }
    } catch (e) {
      console.error(e);
      if (e instanceof DataError) {
        const { details } = e;
        res
          .status(400)
          .send(!!details ? { message: e.message, ...toPlain(e) } : e.message);
      } else if (e instanceof UnauthorizedError) {
        res.status(401).send(e.message);
      } else if (e instanceof NotFoundError) {
        res.status(404).send(e.message);
      } else if (e instanceof TooManyRequestsError) {
        res.status(429).send(e.message);
      } else if (e instanceof PenTestingError) {
        console.error("Pen testing detected");
        res.status(200).redirect("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      } else {
        console.error(e);
        res
          .status(500)
          .send("SERVICE_OFFLINE|Our service temporarily unavailable");
      }
    }
  };

export function checkLogged(user: User | undefined) {
  if (!user) {
    throw new DataError("You aren't logged");
  }
}

export function checkAdmin(user: User) {
  checkLogged(user);
  if (!user.roles?.includes(UserRole.admin)) {
    throw new DataError("You aren't admin");
  }
}

export function checkRoles(user: User, roles: UserRole | UserRole[]) {
  checkLogged(user);
  return (Array.isArray(roles) ? roles : [roles]).some((role) =>
    user.roles?.includes(role)
  );
}

export function toModels<T>(arr: Object[], model: new () => T): T[] {
  return arr.map((o) => toInstance(o, model));
}

export function toModel<T>(obj: Object | null, model: new () => T): T {
  if (!obj) {
    throw new NotFoundError();
  }

  return toInstance(obj, model);
}
