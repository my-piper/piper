import { api } from "../../../app/api";
import mongo from "../../../app/mongo";
import { handle } from "../../../utils/http";

api.get(
  "/api/nodes/packages",
  handle(() => async ({}) => {
    return await mongo.nodePackages.find({}).toArray();
  })
);
