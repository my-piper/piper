import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { Project } from "models/project";
import { getProjectStats } from "packages/projects/stats";
import { checkLogged, checkProjectAccess, handle, toModel } from "utils/http";
import { DEFAULT_PERIOD } from "./consts";
import { ProjectStatsFilter } from "./models";

api.get(
  "/api/projects/:_id/stats",
  handle(({ currentUser }) => async ({ params: { _id }, query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, ProjectStatsFilter);
    await validate(filter);

    const project = toModel(
      await mongo.projects.findOne(
        { $or: [{ _id }, { slug: _id }] },
        { projection: { _id: 1, visibility: 1, createdBy: 1 } }
      ),
      Project
    );
    checkProjectAccess(currentUser, project);

    return toPlain(
      await getProjectStats(project._id, filter.days ?? DEFAULT_PERIOD)
    );
  })
);
