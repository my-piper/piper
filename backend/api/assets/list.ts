import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/packages/transform";
import { UserRole } from "models/user";
import { checkLogged, checkRoles, handle } from "utils/http";
import { AssetsFilter } from "./models/assets-filter";

api.get(
  "/api/assets",
  handle(({ currentUser }) => async ({ query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, AssetsFilter);
    await validate(filter);

    const { folder, type, project } = filter;

    return await mongo.assets
      .find({
        ...(() => {
          return checkRoles(currentUser, UserRole.admin)
            ? {}
            : { "createdBy._id": currentUser._id };
        })(),
        ...(() => (!!folder ? { folder } : {}))(),
        ...(() => (!!type ? { type } : {}))(),
        ...(() => (!!project ? { "project._id": project } : {}))(),
      })
      .sort({ createdAt: -1 })
      .toArray();
  })
);

api.get(
  "/api/assets/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);
    return await mongo.assets.findOne({ _id });
  })
);
