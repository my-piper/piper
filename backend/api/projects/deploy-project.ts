import { toPlain } from "core-kit/utils/models";
import "reflect-metadata";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { redis } from "../../app/redis";
import { DEPLOY, DEPLOY_EXPIRED } from "../../consts/redis";
import { Deploy } from "../../models/deploy";
import { Project } from "../../models/project";
import { RunScope } from "../../models/run-scope";
import { handle, toModel } from "../../utils/http";

api.post(
  "/api/projects/:_id/deploy",
  handle(() => async ({ params: { _id } }) => {
    const project = toModel(
      await mongo.projects.findOne(
        {
          _id,
        },
        {
          projection: {
            _id: 1,
            title: 1,
            pipeline: 1,
            launchRequest: 1,
            environment: 1,
            deploy: 1,
          },
        }
      ),
      Project
    );

    const { pipeline, launchRequest, environment } = project;
    const {
      deploy: { slug, scope },
    } = pipeline;

    const deploy = new Deploy({
      slug,
      scope: (() => {
        const { id, maxConcurrent } = scope;
        return new RunScope({ id, maxConcurrent });
      })(),
      pipeline,
      launchRequest,
      environment,
      project: (() => {
        const { _id, title } = project;
        return new Project({ _id, title });
      })(),
    });
    await redis.setEx(
      DEPLOY(slug),
      DEPLOY_EXPIRED,
      JSON.stringify(toPlain(deploy))
    );

    return null;
  })
);
