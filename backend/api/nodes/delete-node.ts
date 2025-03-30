import api from "app/api";
import mongo from "app/mongo";
import { checkAdmin, handle } from "utils/http";

api.delete(
  "/api/nodes/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkAdmin(currentUser);
    await mongo.nodes.deleteOne({ _id });
    return null;
  })
);
