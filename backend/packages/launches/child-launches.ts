import { toInstance, toPlain } from "core-kit/packages/transform";
import { FatalError } from "core-kit/types/errors";
import merge from "lodash/merge";
import { Deploy } from "models/deploy";
import { Launch, LaunchOptions } from "models/launch";
import { LaunchRequest } from "models/launch-request";
import { Project } from "models/project";
import { User } from "models/user";
import * as deploys from "packages/deploy";
import { ChildLaunchRequest } from "types/node";
import { sid } from "utils/string";
import { canFinish } from "./finished";
import { get, interrupt, run, state } from "./launching";
import { liveState } from "./live-state";

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
  return liveState.children(parent, node);
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
    if (!canFinish(deploy.pipeline)) {
      throw new FatalError(
        `Deploy ${slug} has no pipeline outputs fed by a flow, so its child launch would never finish`
      );
    }
    if (deploy.scope?.activated && deploy.scope.id === parent.scope?.id) {
      throw new FatalError(
        `Deploy ${slug} shares the parent's concurrency scope, so its child launch could wait forever`
      );
    }
    starts.set(request, deploy);
  }

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
  await run(
    {
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
    },
    { id: _id }
  );
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
  const children = (await readChildLaunches(parent._id, node)) ?? {};
  const starts = await validate(parent, requests, children);

  for (const [request, deploy] of starts) {
    // reserve the key before launching: if the worker dies in between, the
    // missing child fails the node instead of a retry starting a duplicate
    const _id = sid();
    children[request.key] = _id;
    await liveState.setChildren(parent._id, node, children);

    try {
      await launchChild(parent, node, _id, request, deploy);
    } catch (e) {
      // a failed start is retryable: stop whatever part of it exists and
      // release the key
      await interrupt(_id);
      delete children[request.key];
      await liveState.setChildren(parent._id, node, children);
      throw e;
    }
  }

  // the parent may have been interrupted while its children were starting
  if (await liveState.interruptedAt(parent._id)) {
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
    if (!(await liveState.exists(launch))) {
      return fail(
        `Child launch ${key} (${launch}) was not started or has expired`
      );
    }

    const child = await get(launch);
    const [{ errors, outputs }, finished] = await Promise.all([
      state(launch),
      liveState.isFinished(child),
    ]);
    if (errors.length > 0) {
      return fail(
        `Child launch ${key} (${launch}) failed: ${errors.join("; ")}`
      );
    }

    states[key] = {
      launch,
      status: finished ? "finished" : "running",
      outputs: Object.fromEntries(outputs),
    };
  }
  return states;
}
