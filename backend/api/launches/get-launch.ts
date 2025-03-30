import api from "app/api";
import mongo from "app/mongo";
import assign from "lodash/assign";
import { checkLogged, handle } from "utils/http";
import * as launching from "../../logic/launches/launching";

api.get(
  "/api/launches/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    const launch = await mongo.launches.findOne({ _id });

    try {
      const { pipeline } = (await launching.getPlain(_id)) as {
        pipeline: Object;
      };
      assign(launch, { pipeline });
    } catch (e) {}

    return launch;
  })
);
