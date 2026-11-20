import mongo from "app/mongo";
import { createLogger } from "core-kit/packages/logger";
import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { Node } from "models/node";
import { NodePackage } from "models/node-package";
import { hasFile, putFile } from "packages/registry/files";
import { toModels } from "utils/http";
import { MANIFEST, readArchive } from "./archive";
import { uploadPackage, validatePackage } from "./update-package";

export type PublishedArchive = {
  nodePackage: string;
  version: number;
  nodes: string[];
  dropped: string[];
};

// A published version's code never changes: Deploys and Launches keep the
// registry reference of the version they were built with, and Deno caches
// registry files by URL. So each upload must bring a greater version.
async function checkVersion(_id: string, version: number) {
  const plain = await mongo.nodePackages.findOne({ _id });
  if (!plain) {
    return;
  }
  const current = toInstance(plain, NodePackage);
  if (current.version >= version) {
    throw new DataError(
      `Package ${_id} already has version ${current.version}; publish a greater version`
    );
  }
}

async function checkOwnership(_id: string, nodes: string[]) {
  const existing = toModels(
    await mongo.nodes.find({ _id: { $in: nodes } }).toArray(),
    Node
  );
  const foreign = existing.filter((n) => !!n.package && n.package !== _id);
  if (foreign.length > 0) {
    throw new DataError(
      "Nodes belong to other packages",
      foreign.map((n) => `${n._id}: ${n.package}`)
    );
  }
}

export async function publishArchive(data: Buffer): Promise<PublishedArchive> {
  const logger = createLogger("publish-archive");

  const { nodePackage, files, dropped } = readArchive(data);
  validatePackage(nodePackage);

  const { _id, version } = nodePackage;
  const nodes = [...nodePackage.nodes.keys()];
  await checkVersion(_id, version);
  await checkOwnership(_id, nodes);

  // package.yaml is written last and marks a version as complete: an upload
  // that failed before it may be retried, a complete one is never overwritten.
  if (await hasFile(_id, version, MANIFEST)) {
    throw new DataError(
      `Package ${_id} version ${version} is already in the registry; publish a greater version`
    );
  }
  logger.info(`Write ${files.size} files of ${_id}@${version} to registry`);
  const ordered = [...files.keys()].sort(
    (a, b) => Number(a === MANIFEST) - Number(b === MANIFEST)
  );
  for (const path of ordered) {
    await putFile(_id, version, path, files.get(path));
  }

  await uploadPackage(nodePackage);

  return { nodePackage: _id, version, nodes, dropped };
}
