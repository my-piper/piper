import api from "app/api";
import mongo from "../app/mongo";
import { checkAdmin, handle } from "../utils/http";

api.get(
  "/api/nodes/packages/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkAdmin(currentUser);
    return await mongo.nodePackages.findOne({ _id });
  })
);
