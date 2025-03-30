import api from "app/api";
import mongo from "app/mongo";
import { NotFoundError } from "core-kit/types/errors";
import { checkAdmin, handle } from "utils/http";

api.delete(
  "/api/users/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }, res) => {
    checkAdmin(currentUser);

    const { deletedCount } = await mongo.users.deleteOne({ _id });
    if (deletedCount <= 0) {
      throw new NotFoundError();
    }

    return null;
  })
);
