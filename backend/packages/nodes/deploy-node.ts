import { DataError, FatalError } from "core-kit/types/errors";
import pick from "lodash/pick";
import { Node } from "models/node";
import * as deploys from "packages/deploy";
import { ChildLaunchState } from "packages/launches/child-launches";
import { NodeInputs } from "types/node";

/** Marks a Node that runs a Deploy as a Child Launch instead of a script. */
export const DEPLOY_NODE_SOURCE = "deploy";

// the key of the one child a deploy node starts
export const DEPLOY_CHILD_KEY = "deploy";

// how long a deploy node waits before it looks at its child again
export const DEPLOY_NODE_DELAY = 3_000;

export function isDeployNode(node: Node): boolean {
  return node.source === DEPLOY_NODE_SOURCE;
}

async function getDeploy({ deploy }: Node) {
  if (!deploy?.slug) {
    throw new FatalError("The Node doesn't name the Deploy it runs");
  }
  try {
    return await deploys.get(deploy.slug, deploy.prefix);
  } catch (e) {
    // a missing Deploy doesn't come back by retrying
    if (e instanceof DataError) {
      throw new FatalError(e.message);
    }
    throw e;
  }
}

/**
 * Fails when the Node's inputs or outputs no longer match its Deploy: an input
 * or output the Deploy doesn't declare, or a required Deploy input the Node
 * lacks.
 */
async function checkSockets(node: Node): Promise<void> {
  const deploy = await getDeploy(node);
  const { inputs, outputs } = deploys.deploySockets(deploy);

  const problems = [
    ...[...node.inputs.keys()]
      .filter((id) => !inputs.has(id))
      .map((id) => `input ${id} is gone`),
    ...[...inputs]
      .filter(([id, input]) => input.required && !node.inputs.has(id))
      .map(([id]) => `required input ${id} is missing`),
    ...[...node.outputs.keys()]
      .filter((id) => !outputs.has(id))
      .map((id) => `output ${id} is gone`),
  ];
  if (problems.length > 0) {
    throw new FatalError(
      `The Node no longer matches Deploy ${deploy.slug} (${problems.join(", ")}): refresh it from the Deploy`
    );
  }
}

/**
 * What a deploy node does on a run, as the result a script would return:
 * start its child, wait for it, then pass on the child's outputs.
 */
export async function runDeployNode(
  node: Node,
  inputs: NodeInputs,
  children: Record<string, ChildLaunchState> | null
): Promise<object> {
  const child = children?.[DEPLOY_CHILD_KEY];
  if (!child) {
    await checkSockets(node);
    const { slug, prefix } = node.deploy;
    return {
      __type: "launch",
      launches: [{ key: DEPLOY_CHILD_KEY, deploy: { slug, prefix }, inputs }],
      delay: DEPLOY_NODE_DELAY,
    };
  }

  if (child.status !== "finished") {
    return { __type: "repeat", delay: DEPLOY_NODE_DELAY };
  }

  return {
    __type: "next",
    outputs: pick(child.outputs, [...node.outputs.keys()]),
  };
}
