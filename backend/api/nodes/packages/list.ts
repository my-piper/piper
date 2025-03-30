import api from "app/api";
import mongo from "../app/mongo";
import { checkAdmin, handle } from "../utils/http";

api.get(
  "/api/nodes/packages",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);
    return await mongo.nodePackages.find({}).toArray();
  })
);
