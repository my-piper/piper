import { api } from "../../../app/api";
import mongo from "../../../app/mongo";
import { handle } from "../../../utils/http";

api.get(
  "/api/launches/outputs",
  handle(() => async () => {
    return await mongo.launchOutputs
      .find({})
      .sort({ filledAt: -1 })
      .limit(20)
      .toArray();
  })
);
