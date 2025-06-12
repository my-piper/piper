import mongo from "app/mongo";
import axios from "axios";
import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { generateSign } from "logic/nodes/sign-node";
import { PackageUpdatedEvent } from "models/events";
import { NodePackage } from "models/node-package";
import { ulid } from "ulid";
import * as YAML from "yaml";

export async function importPackage(source: string) {
  let yaml = source;
  if (/^http/.test(source)) {
    const { data } = await axios(source);
    yaml = data;
  }

  const json = YAML.parse(yaml);
  const nodePackage = toInstance(json, NodePackage);

  await uploadPackage(nodePackage);
}

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
    assign(node, { locked: true, sign: generateSign(node.script) });
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
