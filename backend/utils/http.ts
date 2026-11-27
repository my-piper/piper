import { NO_CACHE_HEADERS } from "consts/http";
import {
  ALL_LANGUAGES,
  DEFAULT_LANGUAGE,
  Languages,
} from "core-kit/packages/locale";
import { createLogger } from "core-kit/packages/logger";
import sentry from "core-kit/packages/sentry";
import { toInstance, toPlain } from "core-kit/packages/transform";
import {
  DataError,
  NotFoundError,
  PenTestingError,
  TooManyRequestsError,
  UnauthorizedError,
} from "core-kit/types/errors";
import { Request, Response } from "express";
import assign from "lodash/assign";
import { User, UserRole } from "models/user";
import { resolveUser, WrongTokenError } from "packages/users/resolve-user";
import { ConflictError } from "types/errors";
import { Injector } from "types/injector";

const USER_TOKEN_HEADER = "user-token";
const API_TOKEN_HEADER = "api-token";

const LANGUAGE_QUERY_PARAM = "language";
export const LANGUAGE_COOKIE = "language";
const LANGUAGE_HEADER = "language";
const ACCEPT_LANGUAGE_HEADER = "accept-language";
export const IP_ADDRESS_HEADER = "cf-connecting-ip";

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
      ip: (req.headers[IP_ADDRESS_HEADER] as string) || req.ip,
      language: DEFAULT_LANGUAGE,
    };

    logger.debug(`Process ${req.method}: ${req.path}`);

    {
      const language = (() => {
        const param = req.query[LANGUAGE_QUERY_PARAM];
        if (param) {
          return param as string;
        }

        {
          const header = req.headers[LANGUAGE_HEADER] as Languages;
          if (!!header && ALL_LANGUAGES.includes(header)) {
            return header;
          }
        }

        const cookie = req.cookies[LANGUAGE_COOKIE];
        if (!!cookie && ALL_LANGUAGES.includes(cookie)) {
          return cookie;
        }

        {
          const header = req.headers[ACCEPT_LANGUAGE_HEADER]?.split(
            ","
          )[0] as Languages;
          if (!!header && ALL_LANGUAGES.includes(header)) {
            return header;
          }
          return null;
        }
      })();
      if (language) {
        assign(injector, { language });
      }
    }

    try {
      const currentUser = await resolveUser({
        userToken: req.headers[USER_TOKEN_HEADER] as string | undefined,
        apiToken: req.headers[API_TOKEN_HEADER] as string | undefined,
      });
      if (currentUser) {
        assign(injector, { currentUser });
      }
    } catch (err) {
      logger.error(err);
      res
        .status(401)
        .send(err instanceof WrongTokenError ? err.message : "Wrong token");
      return;
    }

    try {
      const answer = await handler(injector)(req, res);
      if (answer === null) {
        logger.debug("no answer");
        res.status(204).send();
      } else if (answer !== undefined) {
        logger.debug("send answer");
        res.set(NO_CACHE_HEADERS);
        if (answer) {
          res.status(200).send(answer);
        } else {
          res.status(204).send();
        }
      }
    } catch (e) {
      logger.error(e);
      if (e instanceof DataError) {
        const { details } = e;
        res
          .status(400)
          .send(details ? { message: e.message, ...toPlain(e) } : e.message);
      } else if (e instanceof UnauthorizedError) {
        res.status(401).send(e.message);
      } else if (e instanceof NotFoundError) {
        res.status(404).send(e.message);
      } else if (e instanceof ConflictError) {
        res.status(409).send(e.message);
      } else if (e instanceof TooManyRequestsError) {
        res.status(429).send(e.message);
      } else if (e instanceof PenTestingError) {
        logger.error("pen testing detected");
        res.status(200).redirect("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      } else {
        sentry.captureException(e);
        logger.error(e);
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

export function isAdmin(user: User) {
  return user.roles?.includes(UserRole.admin);
}

export function isEngineer(user: User) {
  return isAdmin(user) || user.roles?.includes(UserRole.engineer);
}

export function checkAdmin(user: User) {
  checkLogged(user);
  if (!isAdmin(user)) {
    throw new DataError("You aren't admin");
  }
}

export function checkEngineer(user: User) {
  checkLogged(user);
  if (!isEngineer(user)) {
    throw new DataError("You aren't admin");
  }
}

export function checkRoles(user: User, roles: UserRole | UserRole[]) {
  checkLogged(user);
  return (Array.isArray(roles) ? roles : [roles]).some((role) =>
    user.roles?.includes(role)
  );
}

// The Mongo filter for the projects a user owns: every projects list, folder,
// tag and stats query shows only these, for admins too (ADR 0008).
export function ownProjects(user: User) {
  return { "createdBy._id": user._id };
}

// A project looks missing to everyone except its owner and admins.
export function checkProjectAccess(
  user: User,
  project: { createdBy?: { _id?: string } }
) {
  if (project.createdBy?._id !== user._id && !isAdmin(user)) {
    throw new NotFoundError();
  }
}

// A launch looks missing to everyone except the user who started it, the
// owner of the project it came from (directly or through a deploy) and admins.
export function checkLaunchAccess(
  user: User,
  launch: {
    launchedBy?: { _id?: string };
    project?: { createdBy?: { _id?: string } };
  } | null
) {
  if (
    !launch ||
    (launch.launchedBy?._id !== user._id &&
      launch.project?.createdBy?._id !== user._id &&
      !isAdmin(user))
  ) {
    throw new NotFoundError();
  }
}

export function toModels<T>(arr: object[], model: new () => T): T[] {
  return arr.map((o) => toInstance(o, model));
}

export function toModel<T>(obj: object | null, model: new () => T): T {
  if (!obj) {
    throw new NotFoundError();
  }

  return toInstance(obj, model);
}
