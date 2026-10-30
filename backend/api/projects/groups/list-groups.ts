import api from "app/api";
import mongo from "app/mongo";
import { UserRole } from "models/user";
import { checkLogged, checkRoles, handle } from "utils/http";

api.get(
  "/api/projects/groups",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const groups = await mongo.projects.distinct(
      "group",
      checkRoles(currentUser, UserRole.admin)
        ? {}
        : {
            $or: [
              { "createdBy._id": currentUser._id },
              { visibility: "public" },
            ],
          }
    );

    return (groups as string[]).filter((g) => !!g).sort();
  })
);
