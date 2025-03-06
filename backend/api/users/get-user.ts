import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { checkLogged, handle } from "../../utils/http";

api.get(
  "/api/users/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);
    return await mongo.users.findOne(
      { _id },
      {
        projection: {
          _id: 1,
          name: 1,
          email: 1,
          roles: 1,
        },
      }
    );
  })
);
