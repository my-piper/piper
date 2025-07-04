import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain } from "core-kit/packages/transform";
import merge from "lodash/merge";
import { LaunchOptions } from "models/launch";
import { LaunchRequest } from "models/launch-request";
import { Project } from "models/project";
import { User } from "models/user";
import { run } from "packages/launches/launching";
import { checkBalance, handle, toModel } from "utils/http";

api.post(
  "/api/projects/:_id/launch",
  handle(({ currentUser }) => async ({ params: { _id }, body }) => {
    checkBalance(currentUser);

    const project = toModel(
      await mongo.projects.findOne(
        {
          _id,
        },
        {
          projection: {
            _id: 1,
            title: 1,
            createdBy: 1,
            pipeline: 1,
            launchRequest: 1,
            environment: 1,
          },
        }
      ),
      Project
    );

    const {
      pipeline,
      launchRequest: projectLaunchRequest,
      environment,
    } = project;

    const launchRequest = toInstance(
      merge(toPlain(projectLaunchRequest), body),
      LaunchRequest
    );

    const launch = await run({
      launchedBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      project: (() => {
        const { _id, title, createdBy } = project;
        return new Project({ _id, title, createdBy });
      })(),
      pipeline,
      launchRequest,
      environment,
      options: new LaunchOptions({
        notify: true,
      }),
      comment: "UI call",
    });
    const plain = toPlain(launch);
    delete plain["pipeline"];
    delete plain["launchRequest"];
    return plain;
  })
);
