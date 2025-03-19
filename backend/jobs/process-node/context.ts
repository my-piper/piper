import { HttpsAgent } from "agentkeepalive";
import { artefact } from "app/storage";
import { streams } from "app/stream";
import axios from "axios";
import { plainToInstance } from "class-transformer";
import { SHARE_FOLDER } from "consts/chrome";
import { MODULES_PATH, NODE_ENV } from "consts/core";
import { GLOBAL_ENVIRONMENT_KEY, USER_ENVIRONMENT_KEY } from "consts/redis";
import { redis } from "core-kit/services/redis/redis";
import { DataError, FatalError, TimeoutError } from "core-kit/types/errors";
import { toPlain } from "core-kit/utils/models";
import { fileTypeFromBuffer } from "file-type";
import { writeFile } from "fs/promises";
import assign from "lodash-es/assign";
import merge from "lodash-es/merge";
import * as deploying from "logic/deploy/get-deploy";
import { decrypt } from "logic/environment/crypt-environment";
import * as launching from "logic/launches/launching";
import { run } from "logic/launches/launching";
import { Environment } from "models/environment";
import { Launch } from "models/launch";
import { LaunchRequest } from "models/launch-request";
import { Node } from "models/node";
import { createRequire } from "node:module";
import { createContext as createVmContext } from "node:vm";
import path from "path";
import { Logger } from "pino";
import { NextNode, RepeatNode } from "types/node";
import { Primitive } from "types/primitive";
import { withTempContext } from "utils/files";
import { sid } from "utils/string";
import { download } from "utils/web";

const packagesLoader = createRequire(path.join(MODULES_PATH, "node_modules"));

export async function createContext({
  logger,
  launch,
  node,
}: {
  launch: Launch;
  node: Node;
  logger: Logger;
}) {
  return createVmContext({
    Reflect,
    Buffer,
    NODE_ENV,
    launch: launch._id,
    DEFINITIONS: {
      DataError,
      FatalError,
      TimeoutError,
      RepeatNode,
      NextNode,
    },
    message: async (message: string, type: string = null) => {
      await streams.pipeline.messages.send({
        createdAt: new Date(),
        project: launch.project._id,
        launch: launch._id,
        node: node._id,
        type,
        message,
      });
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

        const launchRequest = plainToInstance(
          LaunchRequest,
          merge(toPlain(deployLaunchRequest), request)
        );
        const { _id, url } = await run({
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
    console: {
      log: (...args: (boolean | number | string)[]) => {
        logger.info(args.join(" "));
      },
      error: (...args: (boolean | number | string)[]) => {
        logger.info(args.join(" "));
      },
    },
    artefact: (data: Buffer) => artefact(data),
    share: async (url: string) => {
      const { data } = await download(url);
      const fileType = await fileTypeFromBuffer(data);
      if (!fileType) {
        throw new DataError(`Can't detect file type for ${url}`);
      }
      const { ext } = fileType;
      const filePath = path.join(SHARE_FOLDER, [sid(), ext].join("."));
      await writeFile(filePath, data);
      return filePath;
    },
    env: await (async () => {
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
            const global = plainToInstance(Environment, JSON.parse(json));
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
            const user = plainToInstance(Environment, JSON.parse(json));
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
    })(),
    // built-in functions
    download,
    setTimeout,
    clearTimeout,
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
    require: (modulePath: string) => {
      const fullPath = packagesLoader.resolve(modulePath);
      // TODO: think how to flush cache
      // delete packagesLoader.cache[fullPath];
      return packagesLoader(modulePath);
    },
  });
}
