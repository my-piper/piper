import { NotFoundError } from "core-kit/types/errors";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { checkLogged, handle } from "../../utils/http";

api.delete(
  "/api/assets/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    const { deletedCount } = await mongo.assets.deleteOne({ _id });
    if (deletedCount <= 0) {
      throw new NotFoundError();
    }

    return null;
  })
);
