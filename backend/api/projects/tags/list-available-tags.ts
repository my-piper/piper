import api from "app/api";
import mongo from "app/mongo";
import { UserRole } from "models/user";
import { checkLogged, checkRoles, handle } from "utils/http";

api.get(
  "/api/projects/tags/available",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const tags = await mongo.projects.distinct(
      "tags",
      checkRoles(currentUser, UserRole.admin)
        ? {}
        : {
            $or: [
              { "createdBy._id": currentUser._id },
              { visibility: "public" },
            ],
          }
    );

    return (tags as string[]).filter((t) => !!t).sort();
  })
);
