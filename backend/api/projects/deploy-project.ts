import api from "app/api";
import mongo from "app/mongo";
import { DEPLOY, DEPLOY_EXPIRED } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toPlain } from "core-kit/packages/transform";
import { Deploy } from "models/deploy";
import { Project } from "models/project";
import "reflect-metadata";
import { checkAdmin, handle, toModel } from "utils/http";

api.post(
  "/api/projects/:_id/deploy",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkAdmin(currentUser);

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
          },
        }
      ),
      Project
    );

    const { pipeline, launchRequest, environment } = project;
    const {
      deploy: { slug, scope },
    } = pipeline;

    {
      const deploy = new Deploy({
        slug,
        scope,
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
    }

    {
      const deploy = new Deploy({
        slug,
        scope,
      });
      await mongo.projects.updateOne(
        { _id },
        {
          $set: {
            deploy: toPlain(deploy),
          },
        }
      );
    }

    return null;
  })
);
