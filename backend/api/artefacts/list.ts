import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/packages/transform";
import { UserRole } from "models/user";
import { checkLogged, checkRoles, handle } from "utils/http";
import { ArtefactsFilter } from "./model/artefacts-filter";

const PAGE_SIZE = 20;

api.get(
  "/api/artefacts",
  handle(({ currentUser }) => async ({ query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, ArtefactsFilter);
    await validate(filter);

    const { type, project, launch, node, cursor } = filter;

    return await mongo.launchArtefacts
      .find({
        ...(checkRoles(currentUser, UserRole.admin)
          ? {}
          : { "launchedBy._id": currentUser._id }),
        ...(() => (type ? { type } : {}))(),
        ...(!!project ? { project } : {}),
        ...(!!launch ? { launch } : {}),
        ...(!!node ? { node } : {}),
        ...(() => (cursor ? { cursor: { $lt: cursor } } : {}))(),
      })
      .sort({ cursor: -1 })
      .limit(PAGE_SIZE)
      .toArray();
  })
);
