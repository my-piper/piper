import api from "app/api";
import mongo from "app/mongo";
import { DEPLOY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { Deploy } from "models/deploy";
import { DeployConfig } from "models/deploy-config";
import { Project } from "models/project";
import "reflect-metadata";
import { checkLogged, handle, isAdmin, toModel } from "utils/http";

api.post(
  "/api/projects/:_id/deploy",
  handle(({ currentUser }) => async ({ params: { _id }, body }) => {
    checkLogged(currentUser);

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

    const config = toInstance(body, DeployConfig);
    await validate(config);
    const { prefix, slug, scope } = config;

    if (!isAdmin(currentUser) && prefix !== currentUser._id) {
      throw new DataError("You can't deploy this project in this prefix");
    }

    const deploy = new Deploy({
      deployedAt: new Date(),
      prefix,
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

    const plain = toPlain(deploy);
    await mongo.deploys.updateOne(
      { _id: [...(!!prefix ? [prefix] : []), slug].join("_") },
      { $set: plain as { _id: string } },
      { upsert: true }
    );
    await redis.set(DEPLOY(slug, prefix), JSON.stringify(plain));

    await mongo.projects.updateOne(
      { _id },
      {
        $set: {
          deploy: toPlain(
            new Deploy({
              prefix,
              slug,
            })
          ),
        },
      }
    );

    return null;
  })
);
