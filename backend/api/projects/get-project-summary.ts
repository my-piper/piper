import api from "app/api";
import mongo from "app/mongo";
import { toPlain } from "core-kit/packages/transform";
import { Project, ProjectSummary } from "models/project";
import { checkLogged, checkProjectAccess, handle, toModel } from "utils/http";

api.get(
  "/api/projects/:_id/summary",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);
    checkProjectAccess(
      currentUser,
      toModel(
        await mongo.projects.findOne(
          { _id: _id },
          { projection: { createdBy: 1 } }
        ),
        Project
      )
    );

    const summary = toModel(
      {
        comments: await mongo.projectComments.countDocuments({ project: _id }),
      },
      ProjectSummary
    );

    return toPlain(summary);
  })
);
