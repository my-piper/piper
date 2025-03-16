import axios from "axios";
import { plainToInstance } from "class-transformer";
import { toPlain } from "core-kit/utils/models";
import assign from "lodash/assign";
import * as YAML from "yaml";
import mongo from "../../app/mongo";
import {
  PACKAGES_UPDATES,
  PACKAGES_UPDATES_TIMEOUT,
} from "../../consts/packages";
import { redis } from "../../core-kit/services/redis/redis";
import ajv from "../../lib/ajv";
import { createLogger } from "../../logger";
import { NodePackage, NodePackageUpdates } from "../../models/node-package";
import SCHEMAS from "../../schemas/compiled.json" with { type: "json" };
import { toModel } from "../../utils/http";

export async function checkUpdates(_id: string) {
  const logger = createLogger("check-package-updates", {
    package: _id,
  });

  logger.info("Check updates for package");

  const nodePackage = toModel(
    await mongo.nodePackages.findOne({ _id }),
    NodePackage
  );

  const updates = new NodePackageUpdates({
    current: nodePackage,
  });

  const { url } = nodePackage;
  if (!!url) {
    try {
      logger.info(`Load YAML from ${url}`);
      const { data: yaml } = await axios.get(url, {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      const json = YAML.parse(yaml);
      const validate = ajv.compile(SCHEMAS.nodePackage);
      if (validate(json)) {
        const updated = plainToInstance(NodePackage, json);
        logger.info("Schema valid for package");
        if (updated.version > nodePackage.version) {
          logger.info("Package has new version");
          assign(updates, { updated });
        } else {
          logger.info("Package has no updates");
        }
      } else {
        const { errors } = validate;
        logger.error({ errors });
        assign(updates, { errors: "Updated package has invalid schema" });
      }
    } catch (e) {
      logger.error(e);
      assign(updates, { errors: e.message || e.toString() });
    }
  } else {
    logger.warn("Package has no URL for updates");
    assign(updates, { errors: "Packages has no URL for updates" });
  }
  await redis.rPush(PACKAGES_UPDATES, JSON.stringify(toPlain(updates)));
  await redis.expire(PACKAGES_UPDATES, PACKAGES_UPDATES_TIMEOUT);
}
