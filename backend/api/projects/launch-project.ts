import api from "app/api";
import mongo from "app/mongo";
import { MIN_BALANCE_FOR_TRACK, TRACK_BALANCE } from "consts/billing";
import { ACCRUED_USER_BALANCE } from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import { evalScript } from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import merge from "lodash/merge";
import { LaunchOptions } from "models/launch";
import { LaunchRequest } from "models/launch-request";
import { Project } from "models/project";
import { User } from "models/user";
import { run } from "packages/launches/launching";
import { getCosts } from "packages/pipelines";
import { checkBalance, handle, toModel } from "utils/http";

const FLOAT_INCREMENT = `
local key = KEYS[1]
local initial = tonumber(ARGV[1])
local increment = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local val = redis.call("GET", key)
val = tonumber(val)
if not val then
  val = initial
end
val = val - increment
redis.call("SETEX", key, ttl, val)
return string.format("%.20g", val)`;
const ACCRUED_BALANCE_EXPIRE = 300;

const logger = createLogger("launch_project");

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

    if (TRACK_BALANCE) {
      const remaining = currentUser.balance?.remaining || 0;
      if (remaining <= MIN_BALANCE_FOR_TRACK) {
        const { total: costs } = await getCosts(pipeline, launchRequest);

        const key = ACCRUED_USER_BALANCE(currentUser._id, project._id);

        logger.debug(`Accrue balance for ${key}`);

        const balance = await evalScript(
          FLOAT_INCREMENT,
          [key],
          [currentUser.balance?.remaining || 0, costs, ACCRUED_BALANCE_EXPIRE]
        );

        const remained = parseFloat(balance) || 0;
        if (remained <= 0) {
          throw new DataError("Please, top up your balance");
        }
      }
    }

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
    return plain;
  })
);
