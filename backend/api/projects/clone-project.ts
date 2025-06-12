import api from "app/api";
import mongo from "app/mongo";
import { toPlain } from "core-kit/packages/transform";
import { sid } from "core-kit/utils/strings";
import assign from "lodash/assign";
import merge from "lodash/merge";
import { Project } from "models/project";
import { User } from "models/user";
import { ulid } from "ulid";
import { checkLogged, handle, isEngineer, toModel } from "utils/http";

api.post(
  "/api/projects/:_id/clone",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    const project = toModel(
      await mongo.projects.findOne({ _id, visibility: "public" }),
      Project
    );

    const { title } = project;

    merge(project, {
      _id: sid(),
      revision: sid(),
      createdAt: new Date(),
      createdBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      updatedAt: null,
      updatedBy: null,
      visibility: "private",
      pipeline: {
        version: 1,
      },
      title,
      cursor: ulid(),
    });

    delete project.slug;
    delete project.environment;
    delete project.pipeline.url;
    delete project.pipeline.checkUpdates;
    delete project.pipeline.script;
    delete project.pipeline.deploy;

    const { pipeline } = project;
    if (!isEngineer(currentUser)) {
      for (const [, node] of pipeline.nodes) {
        assign(node, { locked: true });
      }
    }

    const plain = toPlain(project);
    await mongo.projects.insertOne(plain as { _id: string });

    delete plain["pipeline"];
    delete plain["launchRequest"];
    return plain;

    return plain;
  })
);
