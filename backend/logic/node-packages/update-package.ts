import mongo from "app/mongo";
import { notify } from "core-kit/services/io";
import { createLogger } from "core-kit/services/logger";
import { toPlain, validate } from "core-kit/utils/models";
import assign from "lodash/assign";
import { ulid } from "ulid";
import { PackageUpdatedEvent } from "../../models/events";
import { NodePackage } from "../../models/node-package";

export async function uploadPackage(nodePackage: NodePackage) {
  await validate(nodePackage);

  const { _id, nodes } = nodePackage;
  const logger = createLogger("update-package", {
    package: _id,
  });

  logger.info("Update nodes");

  const bulk = [];
  for (const [_id, node] of nodes) {
    logger.info(`Update node ${_id}`);
    bulk.push({
      updateOne: {
        filter: { _id },
        update: { $set: toPlain(node) },
        upsert: true,
      },
    });
  }
  await mongo.nodes.bulkWrite(bulk);

  logger.info("Update package");

  assign(nodePackage, { cursor: ulid() });

  const plain = toPlain(nodePackage);
  delete plain["nodes"];

  await mongo.nodePackages.updateOne(
    { _id },
    { $set: plain },
    { upsert: true }
  );

  notify(
    "updating_packages",
    "package_updated",
    new PackageUpdatedEvent({
      nodePackage: _id,
    })
  );
}
