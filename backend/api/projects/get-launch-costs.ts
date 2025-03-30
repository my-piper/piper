import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain } from "core-kit/utils/models";
import merge from "lodash/merge";
import { checkLogged, handle, toModel } from "utils/http";
import { getCosts } from "../../logic/pipelines/pipeline-costs";
import { LaunchRequest } from "../../models/launch-request";
import { Project } from "../../models/project";

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
        if (!!body) {
          merge(request, body);
        }
        return request;
      })(),
      LaunchRequest
    );
    return await getCosts(pipeline, launchRequest);
  })
);
