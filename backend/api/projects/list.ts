import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { UserRole } from "../../models/user";
import { checkLogged, checkRoles, handle } from "../../utils/http";

api.get(
  "/api/projects",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    return await mongo.projects
      .find(
        checkRoles(currentUser, UserRole.admin)
          ? {}
          : {
              $or: [
                { "createdBy._id": currentUser._id },
                { visibility: "public" },
              ],
            },
        {
          projection: {
            _id: 1,
            createdAt: 1,
            createdBy: 1,
            visibility: 1,
            title: 1,
            updatedAt: 1,
            updatedBy: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .toArray();
  })
);
