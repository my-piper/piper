import api from "app/api";
import mongo from "app/mongo";
import { handle } from "utils/http";

api.get(
  "/api/nodes",
  handle(() => async ({}) => {
    return await mongo.nodes
      .find(
        {},
        {
          projection: {
            _id: 1,
            title: 1,
            category: 1,
          },
        }
      )
      .toArray();
  })
);
