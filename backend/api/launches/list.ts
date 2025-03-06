import { toInstance, validate } from "core-kit/utils/models";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { UserRole } from "../../models/user";
import { checkRoles, handle } from "../../utils/http";
import { LaunchesFilter } from "./models/launches-filter";

api.get(
  "/api/launches",
  handle(({ currentUser }) => async ({ query }) => {
    const filter = toInstance(query, LaunchesFilter);
    await validate(filter);

    const { project, parent, cursor } = filter;

    return await mongo.launches
      .find({
        ...(() => {
          return checkRoles(currentUser, UserRole.admin)
            ? {}
            : { "launchedBy._id": currentUser._id };
        })(),
        ...(() => (parent !== "null" ? { parent } : { parent: null }))(),
        ...(() => (!!project ? { "project._id": project } : {}))(),
        ...(() => (cursor ? { cursor: { $lt: cursor } } : {}))(),
      })
      .sort({ launchedAt: -1 })
      .limit(20)
      .toArray();
  })
);
