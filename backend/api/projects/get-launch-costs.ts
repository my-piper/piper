import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain } from "core-kit/packages/transform";
import merge from "lodash/merge";
import { LaunchRequest } from "models/launch-request";
import { Project } from "models/project";
import { getCosts } from "packages/pipelines/pipeline-costs";
import { checkLogged, handle, toModel } from "utils/http";

api.post(
  "/api/projects/:_id/launch-costs",
  handle(({ currentUser }) => async ({ params: { _id }, body }) => {
    checkLogged(currentUser);

    const project = toModel(
      await mongo.projects.findOne(
        {
          _id,
        },
        {
          projection: {
            pipeline: 1,
            launchRequest: 1,
          },
        }
      ),
      Project
    );

    const { pipeline } = project;

    const launchRequest = toInstance(
      (() => {
        const request = toPlain(project.launchRequest);
        if (body) {
          merge(request, body);
        }
        return request;
      })(),
      LaunchRequest
    );
    return toPlain(await getCosts(pipeline, launchRequest, currentUser));
  })
);
