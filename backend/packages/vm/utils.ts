import { MODULES_PATH } from "consts/core";
import { MODULES_FOLDER } from "consts/modules";
import { createLogger } from "core-kit/packages/logger";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const logger = createLogger("vm");
const packagesLoader = createRequire(path.join(MODULES_PATH, "node_modules"));

const cache = {
  require: new Map<string, any>(),
  import: new Map<string, Module>(),
};

export function requireModule(modulePath: string) {
  if (cache.require.has(modulePath)) {
    logger.debug(`Load from cache module ${modulePath}`);
    return cache.require.get(modulePath);
  }
  logger.debug(`Require module ${modulePath}`);
  const module = packagesLoader(modulePath);
  cache.require.set(modulePath, module);
  return module;
}

export async function importModule(specifier: string): Promise<Module> {
  if (cache.import.has(specifier)) {
    logger.debug(`Load from cache module ${specifier}`);
    return cache.require.get(specifier);
  }
  logger.debug(`Import module ${specifier}`);
  const modulePath = pathToFileURL(path.join(MODULES_FOLDER, specifier)).href;
  const module = await import(modulePath);
  cache.import.set(modulePath, module);
  return module;
}
