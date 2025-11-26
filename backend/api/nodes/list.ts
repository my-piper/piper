import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/packages/transform";
import { handle } from "utils/http";
import { NodesFilter } from "./models/nodes-filter";

api.get(
  "/api/nodes",
  handle(() => async ({ query }) => {
    const filter = toInstance(query, NodesFilter);
    await validate(filter);

    const { search } = filter;

    return await mongo.nodes
      .find(
        {
          ...(!!search
            ? {
                title: { $regex: new RegExp(search, "i") },
              }
            : {}),
        },
        {
          projection: {
            _id: 1,
            title: 1,
            category: 1,
            thumbnail: 1,
            version: 1,
            tags: 1,
          },
        }
      )
      .toArray();
  })
);
