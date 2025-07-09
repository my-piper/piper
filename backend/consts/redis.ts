import "core-kit/env";

import { secondsInDay as SECONDS_IN_DAY } from "date-fns";

const KEY_SEPARATOR = ":";

export const REDIS_SECRET_KEY = process.env["REDIS_SECRET_KEY"] || "xyzXYZ";

export const DEPLOY_EXPIRED = SECONDS_IN_DAY * 180;
export const LAUNCH_EXPIRED =
  (() => {
    const value = process.env["LAUNCH_EXPIRED"];
    return !!value ? parseInt(value) : null;
  })() || SECONDS_IN_DAY * 7;
export const LAUNCH_HEARTBEAT_EXPIRED = 30;
export const NODE_PROCESSING_TIMEOUT = 20;
export const DEPLOY = (slug: string) => `deploy:${slug}`;
export const LAUNCH = (launch: string) => `launch:${launch}`;
export const LAUNCH_HEARTBEAT = (launch: string) =>
  `launch:${launch}:heartbeat`;
export const PIPELINE = (launch: string) => `launch:${launch}:pipeline`;

export const NODE_INPUT = (
  launch: string,
  node: string,
  input: string,
  index: string | null = null
) => {
  return ["launch", launch, "nodes", node, "inputs", input].join(KEY_SEPARATOR);
};

export const NODE_INPUT_ELEMENTS = (
  launch: string,
  node: string,
  input: string
) => `launch:${launch}:nodes:${node}:inputs:${input}:*`;

export const NODE_PROCESSING_LOCK = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:processing`;

export const NODE_PROCESSED_LOCK = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:processed`;

export const NODE_OUTPUTS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:outputs`;

export const PIPELINE_OUTPUT = (launch: string, output: string) =>
  `launch:${launch}:outputs:${output}`;

export const PIPELINE_OUTPUT_DATA = (launch: string, output: string) =>
  `launch:${launch}:outputs:${output}:data`;

export const PIPELINE_ERRORS = (launch: string) => `launch:${launch}:errors`;

export const NODE_STATE = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:state`;

export const NODE_PROGRESS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:progress`;

export const NODE_STATUS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:status`;

export const NODE_JOBS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:jobs:*`;

export const NODE_JOB = (launch: string, node: string, job: string) =>
  `launch:${launch}:nodes:${node}:jobs:${job}`;

export const NODE_FLOWS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:flows`;

export const GLOBAL_ENVIRONMENT_KEY = "environment";
export const USER_ENVIRONMENT_KEY = (user: string) => `environment:${user}`;
export const USER_ENVIRONMENT_EXPIRED = 30 * SECONDS_IN_DAY;

export const USER_API_TOKEN_KEY = (id: string) => `user:${id}:api-token`;
export const USER_API_TOKEN_EXPIRED = 180 * SECONDS_IN_DAY;

export const USER_INITIAL_BALANCE_LOCK = (ip: string) =>
  `user:${ip}:initial-balance`;
export const USER_INITIAL_BALANCE_LOCK_EXPIRED = SECONDS_IN_DAY;

export const ACCRUED_USER_BALANCE = (user: string, project: string) =>
  `user:${user}:projects:${project}:accrued-balance`;
