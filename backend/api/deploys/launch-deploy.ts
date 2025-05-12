import api from "app/api";
import { toInstance, toPlain } from "core-kit/packages/transform";
import merge from "lodash/merge";
import * as deploys from "logic/deploy";
import * as launches from "logic/launches";
import { Launch, LaunchOptions } from "models/launch";
import { LaunchRequest } from "models/launch-request";
import { Project } from "models/project";
import { User } from "models/user";
import { checkBalance, checkLogged, handle } from "utils/http";

api.post(
  "/api/:slug/launch",
  handle(({ currentUser }) => async ({ params: { slug }, body, ip }) => {
    checkLogged(currentUser);
    checkBalance(currentUser);

    const {
      project,
      pipeline,
      launchRequest: deployLaunchRequest,
      environment,
      scope,
    } = await deploys.get(slug);

    const launchRequest = toInstance(
      merge(toPlain(deployLaunchRequest), body),
      LaunchRequest
    );

    const { comment } = body;
    const { _id, url } = await launches.run({
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
      scope,
      options: new LaunchOptions({
        notify: false,
      }),
      comment: comment || `API call from ${ip}`,
    });
    return toPlain(new Launch({ _id, url }));
  })
);
