import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { getProjectsRunsSummary } from "packages/projects/stats";
import { checkLogged, handle, ownProjects } from "utils/http";
import { DEFAULT_PERIOD } from "./consts";
import { ProjectsStatsFilter } from "./models";

// registered before "/api/projects/:_id" so "stats" is not taken for an id
api.get(
  "/api/projects/stats",
  handle(({ currentUser }) => async ({ query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, ProjectsStatsFilter);
    await validate(filter);

    const { projects = [], days = DEFAULT_PERIOD } = filter;
    if (projects.length === 0) {
      return [];
    }

    const visible = (
      await mongo.projects
        .find(
          {
            _id: { $in: projects },
            ...ownProjects(currentUser),
          },
          { projection: { _id: 1 } }
        )
        .toArray()
    ).map(({ _id }) => _id as string);

    return toPlain(await getProjectsRunsSummary(visible, days));
  })
);
