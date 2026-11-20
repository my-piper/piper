import "core-kit/env";
import "reflect-metadata";

import { REGISTRY_PORT, REGISTRY_TOKEN } from "consts/registry";
import { createLogger } from "core-kit/packages/logger";
import { createRegistryApp } from "packages/registry/server";

const logger = createLogger("registry");

if (!REGISTRY_TOKEN) {
  logger.error("Set REGISTRY_TOKEN: the registry serves private package code");
  process.exit(1);
}

createRegistryApp().listen(REGISTRY_PORT, () => {
  logger.info(`Package registry is listening on ${REGISTRY_PORT}`);
});
