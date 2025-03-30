import api from "app/api";
import mongo from "app/mongo";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/batches",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    return await mongo.batches.find({}).toArray();
  })
);
