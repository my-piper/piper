import api from "app/api";
import { UserRole } from "models/user";
import mongo from "../app/mongo";
import { checkLogged, checkRoles, handle } from "../utils/http";

const PAGE_SIZE = 20;

api.get(
  "/api/launches/outputs",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    return await mongo.launchOutputs
      .find({
        ...(checkRoles(currentUser, UserRole.admin)
          ? {}
          : { "launchedBy._id": currentUser._id }),
      })
      .sort({ cursor: -1 })
      .limit(PAGE_SIZE)
      .toArray();
  })
);
