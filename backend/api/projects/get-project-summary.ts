import api from "app/api";
import mongo from "app/mongo";
import { toPlain } from "core-kit/utils/models";
import { checkLogged, handle, toModel } from "utils/http";
import { ProjectSummary } from "../../models/project";

api.get(
  "/api/projects/:_id/summary",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    const summary = toModel(
      {
        comments: await mongo.projectComments.countDocuments({ project: _id }),
      },
      ProjectSummary
    );

    return toPlain(summary);
  })
);
