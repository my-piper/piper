import "core-kit/env";

import { secondsInDay as SECONDS_IN_DAY } from "date-fns";

// The Redis layout of a Launch's live state. Only this module reads or writes
// these keys; the formats stay stable so live Launches survive a deploy.

/** How long a Launch's live state lives after its last write, in seconds. */
export const LAUNCH_EXPIRED =
  (() => {
    const value = process.env["LAUNCH_EXPIRED"];
    return value ? parseInt(value) : null;
  })() || SECONDS_IN_DAY * 7;
export const LAUNCH_HEARTBEAT_EXPIRED = 30;
export const NODE_PROCESSING_TIMEOUT = 20;
export const NODE_LOGS_LIMIT = 1000;

export const LAUNCH = (launch: string) => `launch:${launch}`;
export const LAUNCH_HEARTBEAT = (launch: string) =>
  `launch:${launch}:heartbeat`;
export const LAUNCH_INTERRUPTED = (launch: string) =>
  `launch:${launch}:interrupted`;
export const LAUNCH_RUN_RECORDED = (launch: string) =>
  `launch:${launch}:run-recorded`;
export const PIPELINE_OUTPUT = (launch: string, output: string) =>
  `launch:${launch}:outputs:${output}`;
export const PIPELINE_OUTPUT_DATA = (launch: string, output: string) =>
  `launch:${launch}:outputs:${output}:data`;
export const PIPELINE_ERRORS = (launch: string) => `launch:${launch}:errors`;

export const NODE_INPUT = (launch: string, node: string, input: string) =>
  `launch:${launch}:nodes:${node}:inputs:${input}`;
export const NODE_PROCESSING_LOCK = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:processing`;
export const NODE_PROCESSED_LOCK = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:processed`;
export const NODE_OUTPUTS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:outputs`;
export const NODE_STATE = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:state`;
// child launches a node started, keyed by the script's own name for each child
export const NODE_CHILDREN = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:children`;
export const NODE_PROGRESS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:progress`;
export const NODE_STATUS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:status`;
export const NODE_LOGS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:logs`;
// how many of a node's oldest log lines were dropped to stay under NODE_LOGS_LIMIT
export const NODE_LOGS_DROPPED = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:logs:dropped`;
export const NODE_JOBS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:jobs`;
export const NODE_FLOWS = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:flows`;
export const NODE_JOB_DUE = (launch: string, node: string, job: string) =>
  `launch:${launch}:nodes:${node}:jobs:${job}:due`;
// the node's open execution: its invocations until the final outcome
export const NODE_EXECUTION = (launch: string, node: string) =>
  `launch:${launch}:nodes:${node}:execution`;
