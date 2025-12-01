import api from "app/api";
import mongo from "app/mongo";
import { NotFoundError } from "core-kit/types/errors";
import { handle } from "utils/http";

api.delete(
  "/api/launches/:_id",
  handle(() => async ({ params: { _id } }) => {
    const { deletedCount } = await mongo.launches.deleteOne({ _id });
    if (deletedCount <= 0) {
      throw new NotFoundError();
    }
    await mongo.launchArtefacts.deleteMany({ launch: _id });
    return null;
  })
);
