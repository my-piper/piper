import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DeployNode } from "api/deploys/models/deploy-node";
import { Deploy } from "models/deploy";
import { checkLogged, handle, isAdmin } from "utils/http";

// The Deploys a user can pick for a Node: those under their own prefix, and
// for admins also the unprefixed ones. A Deploy without pipeline outputs is
// left out, as its Child Launch would never finish.
api.get(
  "/api/me/deploys",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const prefixes = isAdmin(currentUser)
      ? [currentUser._id, null]
      : [currentUser._id];
    const documents = await mongo.deploys
      .find(
        { prefix: { $in: prefixes } },
        {
          projection: {
            prefix: 1,
            slug: 1,
            deployedAt: 1,
            "project.title": 1,
            "pipeline.outputs": 1,
          },
        }
      )
      .sort({ deployedAt: -1 })
      .toArray();

    return documents
      .map((document) => toInstance(document, Deploy))
      .filter(({ pipeline }) => pipeline?.outputs?.size > 0)
      .map(({ prefix, slug, deployedAt, project }) =>
        toPlain(
          new DeployNode({ prefix, slug, deployedAt, title: project?.title })
        )
      );
  })
);
