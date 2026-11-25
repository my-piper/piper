import api from "app/api";
import mongo from "app/mongo";
import { toPlain } from "core-kit/packages/transform";
import { Project } from "models/project";
import { hide } from "packages/environment/hide-environment";
import { checkLogged, checkProjectAccess, handle, toModel } from "utils/http";

api.get(
  "/api/projects/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    const project = toModel(await mongo.projects.findOne({ _id }), Project);
    checkProjectAccess(currentUser, project);

    if (project.environment) {
      hide(project.environment);
    }

    return toPlain(project);
  })
);
