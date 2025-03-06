import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { checkAdmin, handle } from "../../utils/http";

api.get(
  "/api/users",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    return await mongo.users
      .find({}, { projection: { createdAt: 1, name: 1, email: 1, roles: 1 } })
      .sort({ createdAt: -1 })
      .toArray();
  })
);
