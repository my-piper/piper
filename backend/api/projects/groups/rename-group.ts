import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import escapeRegExp from "lodash/escapeRegExp";
import { Project } from "models/project";
import { UserRole } from "models/user";
import { checkLogged, checkRoles, handle, toModels } from "utils/http";
import { RenameGroup } from "../models/rename-group";

// "/" in a group name nests folders, spaces around it are not significant
const SEPARATOR = "/";
const MAX_LENGTH = 100;

function toSegments(path: string): string[] {
  return path
    .split(SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

api.post(
  "/api/projects/groups/rename",
  handle(({ currentUser }) => async ({ body }) => {
    checkLogged(currentUser);

    const request = toInstance(body, RenameGroup);
    await validate(request);

    const from = toSegments(request.from);
    const to = toSegments(request.to);
    if (from.length === 0 || to.length === 0) {
      throw new DataError("Folder name can't be empty");
    }
    // a folder can't become its own subfolder
    if (
      to.length > from.length &&
      from.every((segment, i) => segment === to[i])
    ) {
      throw new DataError("Folder can't be moved into itself");
    }

    // the folder itself and every folder below it
    const prefix = from
      .map((s) => escapeRegExp(s))
      .join(`\\s*${escapeRegExp(SEPARATOR)}\\s*`);
    const projects = toModels(
      await mongo.projects
        .find(
          {
            group: { $regex: new RegExp(`^\\s*${prefix}\\s*(/|$)`) },
            ...(checkRoles(currentUser, UserRole.admin)
              ? {}
              : { "createdBy._id": currentUser._id }),
          },
          { projection: { group: 1 } }
        )
        .toArray(),
      Project
    );

    const updates = projects.map(({ _id, group }) => ({
      _id,
      group: [...to, ...toSegments(group).slice(from.length)].join(SEPARATOR),
    }));
    if (updates.some(({ group }) => group.length > MAX_LENGTH)) {
      throw new DataError("Folder name is too long");
    }

    if (updates.length > 0) {
      await mongo.projects.bulkWrite(
        updates.map(({ _id, group }) => ({
          updateOne: { filter: { _id }, update: { $set: { group } } },
        }))
      );
    }

    return { renamed: updates.length };
  })
);
