import api from "app/api";
import mongo from "app/mongo";
import { NotFoundError } from "core-kit/types/errors";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.delete(
  "/api/launches/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    await checkLaunchVisible(currentUser, _id);

    const { deletedCount } = await mongo.launches.deleteOne({ _id });
    if (deletedCount <= 0) {
      throw new NotFoundError();
    }
    await mongo.launchArtefacts.deleteMany({ launch: _id });
    return null;
  })
);
