import { HttpsAgent } from "agentkeepalive";
import { artefact } from "app/storage";
import { streams } from "app/streams";
import axios from "axios";
import { NODE_ENV } from "consts/core";
import {
  GLOBAL_ENVIRONMENT_KEY,
  LAUNCH_EXPIRED,
  NODE_LOGS,
  USER_ENVIRONMENT_KEY,
} from "consts/redis";
import { Job } from "core-kit/packages/queue";
import redis from "core-kit/packages/redis";
import { mapTo, toInstance, toPlain } from "core-kit/packages/transform";
import { DataError, FatalError, TimeoutError } from "core-kit/types/errors";
import assign from "lodash-es/assign";
import merge from "lodash-es/merge";
import { Environment } from "models/environment";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { Launch } from "models/launch";
import { LaunchRequest } from "models/launch-request";
import { Node, NodeLog } from "models/node";
import { createContext as createVmContext } from "node:vm";
import * as deploying from "packages/deploy/get-deploy";
import { decrypt } from "packages/environment/crypt-environment";
import * as launching from "packages/launches/launching";
import { run } from "packages/launches/launching";
import { requireModule } from "packages/vm/utils";
import { Logger } from "pino";
import { NextNode, RepeatNode } from "types/node";
import { Primitive } from "types/primitive";
import { withTempContext } from "utils/files";
import { download } from "utils/web";

export async function getEnv({
  launch,
  node,
}: {
  launch: Launch;
  node: Node;
}): Promise<Environment> {
  const env = new Environment({
    variables: new Map<string, Primitive>(),
  });
  if (!!node.environment) {
    const environment: {
      global?: Environment;
      user?: Environment;
      pipeline: Environment;
    } = { pipeline: launch.environment };

    // global environment
    {
      const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
      if (!!json) {
        const global = toInstance(JSON.parse(json), Environment);
        if (!!global) {
          assign(environment, { global });
        }
      }
    }

    // user environment
    {
      const { launchedBy } = launch;
      const json = await redis.get(USER_ENVIRONMENT_KEY(launchedBy._id));
      if (!!json) {
        const user = toInstance(JSON.parse(json), Environment);
        if (!!user) {
          assign(environment, { user });
        }
      }
    }

    for (const [k, v] of node.environment) {
      switch (v.scope) {
        case "global": {
          const value = environment.global?.variables?.get(k);
          if (value !== undefined) {
            env.variables.set(k, value);
          }
          break;
        }
        case "user": {
          const value = environment.user?.variables?.get(k);
          if (value !== undefined) {
            env.variables.set(k, value);
          }
          break;
        }
        case "pipeline": {
          const value = environment.pipeline?.variables?.get(k);
          if (value !== undefined) {
            env.variables.set(k, value);
          }
          break;
        }
      }
    }
    try {
      decrypt(env);
    } catch (e) {
      throw new FatalError("Can't decrypt environment");
    }
  }
  return env;
}

export async function createContext({
  job,
  nodeJob,
  logger,
  launch,
  node,
}: {
  job: Job;
  nodeJob: ProcessNodeJob;
  launch: Launch;
  node: Node;
  logger: Logger;
}) {
  const env = await getEnv({ launch, node });

  const debug = async (
    level: "debug" | "info" | "warn" | "error",
    ...args: (boolean | number | string)[]
  ) => {
    const message = args.join(" ");
    const { id, attemptsMade } = job;
    const plain = toPlain(
      mapTo({ message, level, job: id, attempt: attemptsMade }, NodeLog)
    );
    const key = NODE_LOGS(launch._id, nodeJob.node);
    await redis.rPush(key, JSON.stringify(plain));
    await redis.expire(key, LAUNCH_EXPIRED);
  };

  return createVmContext({
    console: {
      log: async (...args: (boolean | number | string)[]) => {
        await debug("debug", ...args);
      },
      info: async (...args: (boolean | number | string)[]) => {
        await debug("info", ...args);
      },
      warn: async (...args: (boolean | number | string)[]) => {
        await debug("warn", ...args);
      },
      error: async (...args: (boolean | number | string)[]) => {
        await debug("error", ...args);
      },
    },
    // TODO: remove then
    DEFINITIONS: {
      NextNode,
      RepeatNode,
      FatalError,
      DataError,
      TimeoutError,
    },
    artefact: (data: Buffer) => artefact(data),
    download,
    useTempFolder: withTempContext,
    httpClient: axios.create({
      httpsAgent: new HttpsAgent({
        keepAliveMsecs: 15000,
        maxSockets: 150,
        maxFreeSockets: 10,
        timeout: 10000,
        freeSocketTimeout: 30000,
      }),
    }),
    // built-in functions
    Buffer,
    NODE_ENV,
    setTimeout,
    clearTimeout,
    require: (modulePath: string) => {
      logger.debug(`Require module ${modulePath}`);
      if (modulePath === "@piper/node") {
        return {
          launch: launch._id,
          throwError: {
            data: (message: string, details: object = {}) => {
              throw new DataError(message, details);
            },
            fatal: (message: string) => {
              throw new FatalError(message);
            },
            timeout: (message: string) => {
              throw new TimeoutError(message);
            },
          },
          next(obj: object) {
            return mapTo(obj, NextNode);
          },
          repeat(obj: object) {
            return mapTo(obj, RepeatNode);
          },
          env: toPlain(env),
          messages: {
            defect: async (message: string) => {
              await streams.pipeline.messages.send({
                createdAt: new Date(),
                project: launch.project._id,
                launch: launch._id,
                node: node._id,
                type: "defect",
                message,
              });
            },
          },
          nested: {
            run: async (
              slug: string,
              request: { [key: string]: Primitive } = {}
            ): Promise<Launch> => {
              const {
                project,
                pipeline,
                launchRequest: deployLaunchRequest,
                environment,
                scope,
              } = await deploying.get(slug);

              const launchRequest = toInstance(
                merge(toPlain(deployLaunchRequest), request),
                LaunchRequest
              );

              const { launchedBy } = launch;
              const { _id, url } = await run({
                launchedBy,
                pipeline,
                launchRequest,
                environment,
                scope,
                project,
                parent: launch._id,
                comment: `Nested from node ${node.title}`,
              });

              return new Launch({ _id, url });
            },
            state: async (id: string): Promise<object> => launching.state(id),
          },
          artefact: (data: Buffer) => artefact(data),
          download,
          useTempFolder: withTempContext,
          httpRequest: axios.create({
            httpsAgent: new HttpsAgent({
              keepAliveMsecs: 15000,
              maxSockets: 150,
              maxFreeSockets: 10,
              timeout: 10000,
              freeSocketTimeout: 30000,
            }),
          }),
        };
      }
      return requireModule(modulePath);
    },
  });
}
