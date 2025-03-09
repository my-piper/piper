import { toInstance, validate } from "core-kit/utils/models";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { UserRole } from "../../models/user";
import { checkLogged, checkRoles, handle } from "../../utils/http";
import { ProjectsFilter } from "./models/projects-filter";

const PAGE_SIZE = 20;

api.get(
  "/api/projects",
  handle(({ currentUser }) => async ({ query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, ProjectsFilter);
    await validate(filter);

    const { cursor } = filter;

    return await mongo.projects
      .find(
        {
          ...(() => (cursor ? { cursor: { $lt: cursor } } : {}))(),
          ...(checkRoles(currentUser, UserRole.admin)
            ? {}
            : {
                $or: [
                  { "createdBy._id": currentUser._id },
                  { visibility: "public" },
                ],
              }),
        },
        {
          projection: {
            _id: 1,
            createdAt: 1,
            createdBy: 1,
            visibility: 1,
            title: 1,
            updatedAt: 1,
            updatedBy: 1,
            cursor: 1,
          },
        }
      )
      .sort({ cursor: -1 })
      .limit(PAGE_SIZE)
      .toArray();
  })
);
