import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/utils/models";
import { ProjectCommentsFilter } from "models/project";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/projects/:project/comments",
  handle(({ currentUser }) => async ({ params: { project }, query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, ProjectCommentsFilter);
    await validate(filter);

    const { cursor } = filter;

    return await mongo.projectComments
      .find({ project, ...(!!cursor ? { _id: { $lt: cursor } } : {}) })
      .sort({ _id: -1 })
      .limit(20)
      .toArray();
  })
);
