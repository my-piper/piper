import "core-kit/env";
import "reflect-metadata";

import { REGISTRY_PORT } from "consts/registry";
import { createLogger } from "core-kit/packages/logger";
import { createRegistryApp } from "packages/registry/server";

const logger = createLogger("registry");

createRegistryApp().listen(REGISTRY_PORT, () => {
  logger.info(`Package registry is listening on ${REGISTRY_PORT}`);
});
