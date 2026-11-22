import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
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
};

api.get(
  "/api/nodes",
  handle(() => async ({ query }) => {
    const filter = toInstance(query, NodesFilter);
    await validate(filter);

    const { search } = filter;

    const nodes = await mongo.nodes
      .find(
        {
          ...(search
            ? {
                title: { $regex: new RegExp(search, "i") },
              }
            : {}),
        },
        { projection: PROJECTION }
      )
      .toArray();

    if (!matchesScriptNode(search)) {
      return nodes;
    }
    return [pick(toPlain(scriptNode()), Object.keys(PROJECTION)), ...nodes];
  })
);
