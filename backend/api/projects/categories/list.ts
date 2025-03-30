import api from "app/api";
import mongo from "app/mongo";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/projects/categories",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    return await mongo.projectCategories.find({}).sort({ order: 1 }).toArray();
  })
);
