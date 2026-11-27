import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { hasInputOf } from "packages/nodes/accepts";
import { matchesScriptNode, scriptNode } from "packages/nodes/script-node";
import pick from "lodash/pick";
import { handle } from "utils/http";
import { NodesFilter } from "./models/nodes-filter";

const PROJECTION = {
  _id: 1,
  title: 1,
  category: 1,
  thumbnail: 1,
  version: 1,
  tags: 1,
  order: 1,
  package: 1,
};

api.get(
  "/api/nodes",
  handle(() => async ({ query }) => {
    const filter = toInstance(query, NodesFilter);
    await validate(filter);

    const { search } = filter;
    const accepts = (filter.accepts ?? "").split(",").filter(Boolean);

    const nodes = await mongo.nodes
      .find(
        {
          ...(search
            ? {
                title: { $regex: new RegExp(search, "i") },
              }
            : {}),
          ...(accepts.length > 0 ? { $expr: hasInputOf(accepts) } : {}),
        },
        { projection: PROJECTION }
      )
      .toArray();
    const listed = await withPackageTitles(nodes);

    // The Script Node has no inputs until its author adds them.
    if (accepts.length > 0 || !matchesScriptNode(search)) {
      return listed;
    }
    return [pick(toPlain(scriptNode()), Object.keys(PROJECTION)), ...listed];
  })
);

/** Adds the title of each node's Node Package, so the catalog can group nodes by it. */
async function withPackageTitles<T extends object>(nodes: T[]) {
  const packageOf = (node: T) => (node as { package?: string }).package;
  const ids = [...new Set(nodes.map(packageOf).filter(Boolean))];
  if (ids.length === 0) {
    return nodes;
  }
  const packages = await mongo.nodePackages
    .find({ _id: { $in: ids } }, { projection: { title: 1 } })
    .toArray();
  const titles = new Map(
    packages.map(({ _id, title }: { _id: string; title?: string }) => [
      _id,
      title,
    ])
  );
  return nodes.map((node) => {
    const packageTitle = titles.get(packageOf(node));
    return packageTitle ? { ...node, packageTitle } : node;
  });
}
