import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/packages/transform";
import { Project, ProjectCommentsFilter } from "models/project";
import { checkLogged, checkProjectAccess, handle, toModel } from "utils/http";

api.get(
  "/api/projects/:project/comments",
  handle(({ currentUser }) => async ({ params: { project }, query }) => {
    checkLogged(currentUser);
    checkProjectAccess(
      currentUser,
      toModel(
        await mongo.projects.findOne(
          { _id: project },
          { projection: { createdBy: 1 } }
        ),
        Project
      )
    );

    const filter = toInstance(query, ProjectCommentsFilter);
    await validate(filter);

    const { cursor } = filter;

    return await mongo.projectComments
      .find({ project, ...(cursor ? { _id: { $lt: cursor } } : {}) })
      .sort({ _id: -1 })
      .limit(20)
      .toArray();
  })
);
