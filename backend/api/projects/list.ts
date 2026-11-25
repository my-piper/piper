import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/packages/transform";
import escapeRegExp from "lodash/escapeRegExp";
import { checkLogged, handle, ownProjects } from "utils/http";
import { ProjectsFilter } from "./models/projects-filter";

const PAGE_SIZE = 20;

api.get(
  "/api/projects",
  handle(({ currentUser }) => async ({ query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, ProjectsFilter);
    await validate(filter);

    const { tags, group, ungrouped, search, cursor } = filter;

    return await mongo.projects
      .find(
        {
          ...(search
            ? { title: { $regex: new RegExp(escapeRegExp(search), "i") } }
            : {}),
          ...(tags?.length > 0 ? { tags: { $all: tags } } : {}),
          ...(group ? { group } : ungrouped ? { group: null } : {}),
          ...(cursor ? { cursor: { $lt: cursor } } : {}),
          ...ownProjects(currentUser),
        },
        {
          projection: {
            _id: 1,
            tags: 1,
            group: 1,
            createdAt: 1,
            createdBy: 1,
            title: 1,
            updatedAt: 1,
            updatedBy: 1,
            "pipeline.thumbnail": 1,
            "pipeline.description": 1,
            "pipeline.version": 1,
            cursor: 1,
          },
        }
      )
      .sort({ cursor: -1 })
      .limit(PAGE_SIZE)
      .toArray();
  })
);
