import api from "app/api";
import mongo from "app/mongo";
import { NotFoundError } from "core-kit/types/errors";
import { checkAdmin, handle } from "utils/http";

api.delete(
  "/api/node-packages/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkAdmin(currentUser);

    const { deletedCount } = await mongo.nodePackages.deleteOne({ _id });
    if (deletedCount <= 0) {
      throw new NotFoundError();
    }

    return null;
  })
);
