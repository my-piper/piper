import ajv from "app/ajv";
import mongo from "app/mongo";
import axios from "axios";
import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import assign from "lodash/assign";
import { PackageUpdatedEvent } from "models/events";
import { NodePackage } from "models/node-package";
import { generateSign } from "packages/nodes/sign-node";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import { ulid } from "ulid";
import * as YAML from "yaml";

export async function importPackage(source: string) {
  const logger = createLogger("import-package");

  let yaml = source;
  if (/^http/.test(source)) {
    logger.info(`Import from URL ${source}`);
    const { data } = await axios(source);
    yaml = data;
  } else {
    logger.info("Import from YAML");
  }

  let json: object;
  try {
    json = YAML.parse(yaml);
  } catch (e) {
    throw new DataError("YAML parse error");
  }

  const nodePackage = toInstance(json, NodePackage);

  await uploadPackage(nodePackage);
}

export async function uploadPackage(nodePackage: NodePackage) {
  const logger = createLogger("update-package");

  const validate = ajv.compile(SCHEMAS.nodePackage);
  if (!validate(nodePackage)) {
    const { errors } = validate;
    logger.error(JSON.stringify(errors));
    throw new DataError(
      "Node package schema invalid",
      errors.map((e) => `${e.propertyName || e.instancePath}: ${e.message}`)
    );
  }

  console.log(nodePackage);

  const { _id, nodes } = nodePackage;

  if (nodes.size <= 0) {
    throw new DataError("Package has no nodes");
  }

  logger.info("Update nodes");

  const bulk = [];
  for (const [_id, node] of nodes) {
    logger.info(`Update node ${_id}`);
    assign(node, { locked: true, sign: generateSign(node) });
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
