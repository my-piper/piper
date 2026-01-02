import api from "app/api";
import mongo from "app/mongo";
import { checkLogged, handle } from "utils/http";

const PAGE_SIZE = 20;

api.get(
  "/api/projects/:project/deploys",
  handle(({ currentUser }) => async ({ params: { project } }) => {
    checkLogged(currentUser);

    return await mongo.deploys
      .find(
        {
          "project._id": project,
        },
        {
          projection: {
            _id: 1,
            slug: 1,
            prefix: 1,
            deployedAt: 1,
            cursor: 1,
          },
        }
      )
      .sort({ deployedAt: -1 })
      .limit(PAGE_SIZE)
      .toArray();
  })
);
