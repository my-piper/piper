import api from "app/api";
import mongo from "app/mongo";
import { UserRole } from "models/user";
import { checkLogged, checkRoles, handle } from "utils/http";

api.get(
  "/api/projects/groups/counts",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const groups = await mongo.projects
      .aggregate([
        {
          $match: {
            group: { $nin: [null, ""] },
            ...(checkRoles(currentUser, UserRole.admin)
              ? {}
              : {
                  $or: [
                    { "createdBy._id": currentUser._id },
                    { visibility: "public" },
                  ],
                }),
          },
        },
        { $group: { _id: "$group", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, group: "$_id", count: 1 } },
      ])
      .toArray();

    return groups as { group: string; count: number }[];
  })
);
