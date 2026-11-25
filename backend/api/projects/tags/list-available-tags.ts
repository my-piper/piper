import api from "app/api";
import mongo from "app/mongo";
import { checkLogged, handle, ownProjects } from "utils/http";

api.get(
  "/api/projects/tags/available",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const tags = await mongo.projects.distinct(
      "tags",
      ownProjects(currentUser)
    );

    return (tags as string[]).filter((t) => !!t).sort();
  })
);
