import mongo from "app/mongo";
import { BILLING_ACTIVE } from "consts/billing";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  LAUNCH_INTERRUPTED,
  NODE_CHILDREN,
} from "consts/redis";
import redis, { exists, readObject, saveObject } from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { FatalError } from "core-kit/types/errors";
import merge from "lodash/merge";
import { Deploy } from "models/deploy";
import { Launch, LaunchOptions } from "models/launch";
import { LaunchRequest } from "models/launch-request";
import { Project } from "models/project";
import { User } from "models/user";
import * as deploys from "packages/deploy";
import { checkRateLimits } from "packages/users/check-rate-limits";
import { ChildLaunchRequest } from "types/node";
import { checkBalance } from "utils/http";
import { sid } from "utils/string";
import { get, interrupt, run, state } from "./launching";

export const MAX_CHILD_DEPTH = 3;
export const MAX_CHILDREN_PER_NODE = 10;

// script key -> child launch id
type ChildLaunches = Record<string, string>;

export type ChildLaunchState = {
  launch: string;
  status: "running" | "finished";
  outputs: object;
};

export class ChildLaunchFailedError extends FatalError {}

async function readChildLaunches(
  parent: string,
  node: string
): Promise<ChildLaunches | null> {
  return (await readObject(NODE_CHILDREN(parent, node))) as ChildLaunches;
}

async function checkBilling(launchedBy: User) {
  if (!BILLING_ACTIVE) {
    return;
  }

  const user = toInstance(
    await mongo.users.findOne(
      { _id: launchedBy._id },
      { projection: { _id: 1, balance: 1 } }
    ),
    User
  );
  checkBalance(user);
  await checkRateLimits(user);
}

// every check runs before any child starts, so a bad request never leaves
// earlier siblings running
async function validate(
  parent: Launch,
  requests: ChildLaunchRequest[],
  children: ChildLaunches
): Promise<Map<ChildLaunchRequest, Deploy>> {
  const pending = requests.filter(({ key }) => !children[key]);
  const starts = new Map<ChildLaunchRequest, Deploy>();
  if (pending.length === 0) {
    return starts;
  }

  const total = Object.keys(children).length + pending.length;
  if (total > MAX_CHILDREN_PER_NODE) {
    throw new FatalError(
      `A node can start at most ${MAX_CHILDREN_PER_NODE} child launches, asked for ${total}`
    );
  }

  if ((parent.depth || 0) + 1 > MAX_CHILD_DEPTH) {
    throw new FatalError(
      `Child launches are limited to ${MAX_CHILD_DEPTH} levels`
    );
  }

  for (const request of pending) {
    const { slug, prefix } = request.deploy;
    const deploy = await deploys.get(slug, prefix);
    if (!deploy.pipeline.outputs?.size) {
      throw new FatalError(
        `Deploy ${slug} has no pipeline outputs, so its child launch would never finish`
      );
    }
    if (deploy.scope?.activated && deploy.scope.id === parent.scope?.id) {
      throw new FatalError(
        `Deploy ${slug} shares the parent's concurrency scope, so its child launch could wait forever`
      );
    }
    starts.set(request, deploy);
  }

  await checkBilling(parent.launchedBy);
  return starts;
}

async function launchChild(
  parent: Launch,
  node: string,
  _id: string,
  request: ChildLaunchRequest,
  deploy: Deploy
) {
  const { project, pipeline, environment, scope } = deploy;
  await run({
    _id,
    launchedBy: new User({ _id: parent.launchedBy._id }),
    project: new Project({
      _id: project._id,
      title: project.title,
      createdBy: project.createdBy,
    }),
    pipeline,
    launchRequest: toInstance(
      merge(toPlain(deploy.launchRequest ?? new LaunchRequest()), {
        inputs: request.inputs ?? {},
      }),
      LaunchRequest
    ),
    environment,
    scope,
    parent: parent._id,
    depth: (parent.depth || 0) + 1,
    options: new LaunchOptions({ notify: parent.options?.notify ?? false }),
    comment: `Child of launch ${parent._id} node ${node}`,
  });
}

/**
 * Starts the child launches a node asked for. A key that already has a child
 * is skipped, so a retried node never starts (and pays for) a second child.
 */
export async function startChildren(
  parent: Launch,
  node: string,
  requests: ChildLaunchRequest[]
): Promise<void> {
  const key = NODE_CHILDREN(parent._id, node);
  const children = (await readChildLaunches(parent._id, node)) ?? {};
  const starts = await validate(parent, requests, children);

  for (const [request, deploy] of starts) {
    // reserve the key before launching: if the worker dies in between, the
    // missing child fails the node instead of a retry starting a duplicate
    const _id = sid();
    children[request.key] = _id;
    await saveObject(key, children, LAUNCH_EXPIRED);

    try {
      await launchChild(parent, node, _id, request, deploy);
    } catch (e) {
      // a failed start is retryable: stop whatever part of it exists and
      // release the key
      await interrupt(_id);
      delete children[request.key];
      await saveObject(key, children, LAUNCH_EXPIRED);
      throw e;
    }
  }

  // the parent may have been interrupted while its children were starting
  if (await exists(LAUNCH_INTERRUPTED(parent._id))) {
    for (const child of starts.keys()) {
      await interrupt(children[child.key]);
    }
  }
}

/**
 * Reads the state of every child launch a node started, for the script payload.
 * When a child failed, interrupts its siblings and throws, so the parent node
 * fails without retrying.
 */
export async function readChildren(
  parent: string,
  node: string
): Promise<Record<string, ChildLaunchState> | null> {
  const children = await readChildLaunches(parent, node);
  if (!children) {
    return null;
  }

  const fail = async (message: string): Promise<never> => {
    for (const child of Object.values(children)) {
      await interrupt(child);
    }
    throw new ChildLaunchFailedError(message);
  };

  const states: Record<string, ChildLaunchState> = {};
  for (const [key, launch] of Object.entries(children)) {
    if (!(await redis.get(LAUNCH(launch)))) {
      return fail(
        `Child launch ${key} (${launch}) was not started or has expired`
      );
    }

    const [{ pipeline }, { errors, outputs }] = await Promise.all([
      get(launch),
      state(launch),
    ]);
    if (errors.length > 0) {
      return fail(
        `Child launch ${key} (${launch}) failed: ${errors.join("; ")}`
      );
    }

    states[key] = {
      launch,
      status: outputs.size >= pipeline.outputs.size ? "finished" : "running",
      outputs: Object.fromEntries(outputs),
    };
  }
  return states;
}
