import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/utils/models";
import { checkLogged, checkRoles, handle } from "utils/http";
import { UserRole } from "../../models/user";
import { LaunchesFilter } from "./models/launches-filter";

api.get(
  "/api/launches",
  handle(({ currentUser }) => async ({ query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, LaunchesFilter);
    await validate(filter);

    const { project, parent, cursor } = filter;

    return await mongo.launches
      .find({
        ...(checkRoles(currentUser, UserRole.admin)
          ? {}
          : { "launchedBy._id": currentUser._id }),
        ...(() => (parent !== "null" ? { parent } : { parent: null }))(),
        ...(() => (!!project ? { "project._id": project } : {}))(),
        ...(() => (cursor ? { cursor: { $lt: cursor } } : {}))(),
      })
      .sort({ launchedAt: -1 })
      .limit(20)
      .toArray();
  })
);
