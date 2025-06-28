import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/packages/transform";
import { UserRole } from "models/user";
import { checkLogged, checkRoles, handle } from "utils/http";
import { AssetsFilter } from "../models/assets-filter";

api.get(
  "/api/assets/folders",
  handle(({ currentUser }) => async ({ query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, AssetsFilter);
    await validate(filter);

    const { type, project } = filter;

    const [aggregated] = await mongo.assets
      .aggregate([
        {
          $match: {
            ...(checkRoles(currentUser, UserRole.admin)
              ? {}
              : { "createdBy._id": currentUser._id }),
            folder: { $ne: null },
            ...(type ? { type } : {}),
            ...(project ? { "project._id": project } : {}),
          },
        },
        {
          $group: {
            _id: "$folder",
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
        {
          $group: {
            _id: null,
            folders: { $push: "$_id" },
          },
        },
        {
          $project: {
            _id: 0,
            folders: 1,
          },
        },
      ])
      .toArray();

    return aggregated?.folders || [];
  })
);
