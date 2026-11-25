import api from "app/api";
import mongo from "app/mongo";
import { checkLogged, handle, ownProjects } from "utils/http";

api.get(
  "/api/projects/groups",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const groups = await mongo.projects.distinct(
      "group",
      ownProjects(currentUser)
    );

    return (groups as string[]).filter((g) => !!g).sort();
  })
);
