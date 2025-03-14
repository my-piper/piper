import { toInstance, toPlain } from "core-kit/utils/models";
import merge from "lodash/merge";
import { Launch, LaunchOptions } from "models/launch";
import { LaunchRequest } from "models/launch-request";
import { Project } from "models/project";
import { User } from "models/user";
import { api } from "../../app/api";
import * as deploying from "../../logic/deploy";
import * as launching from "../../logic/launches";
import { checkLogged, handle } from "../../utils/http";

api.post(
  "/api/:slug/launch",
  handle(({ currentUser }) => async ({ params: { slug }, body, ip }) => {
    checkLogged(currentUser);

    const {
      project,
      pipeline,
      launchRequest: deployLaunchRequest,
      environment,
      scope,
    } = await deploying.get(slug);

    const launchRequest = toInstance(
      merge(toPlain(deployLaunchRequest), body),
      LaunchRequest
    );

    const { comment } = body;
    const { _id, url } = await launching.run({
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
        notify: true,
      }),
      comment: comment || `API call from ${ip}`,
    });
    return toPlain(new Launch({ _id, url }));
  })
);
