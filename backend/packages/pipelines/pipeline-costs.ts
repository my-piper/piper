import { createLogger } from "core-kit/packages/logger";
import { mapTo, toPlain, validate } from "core-kit/packages/transform";
import { getEnvironment } from "jobs/process-node/environment";
import assign from "lodash/assign";
import { Environment } from "models/environment";
import { LaunchRequest, NodeToLaunch } from "models/launch-request";
import { NodeCosts, Pipeline, PipelineCosts } from "models/pipeline";
import { User } from "models/user";
import { execute, ExecutionError } from "packages/deno";
import { NodeInputs } from "types/node";
import { Primitive } from "types/primitive";
import { convertInputs } from "utils/node";

const logger = createLogger("pipeline_costs");

const COSTS_FUNCTION = "costs";

async function run(
  script: string,
  { environment, inputs }: { environment?: Environment; inputs: NodeInputs }
): Promise<number | object> {
  try {
    const { result, logs } = await execute(
      script,
      COSTS_FUNCTION,
      {
        ...(!!environment ? { env: toPlain(environment) } : {}),
        inputs,
      },
      { timeout: 5_000, isolation: "none" }
    );
    return result as number | object;
  } catch (err) {
    if (err instanceof ExecutionError) {
      logger.debug(err);
    }
    return 0;
  }
}

export async function getCosts(
  pipeline: Pipeline,
  launchRequest: LaunchRequest,
  forUser: User
): Promise<PipelineCosts> {
  const getNodeInputs = (id: string) => {
    let toLaunch = launchRequest.nodes.get(id);
    if (!toLaunch) {
      toLaunch = mapTo({}, NodeToLaunch);
      launchRequest.nodes.set(id, toLaunch);
    }

    if (!toLaunch.inputs) {
      toLaunch.inputs = new Map<string, Primitive>();
    }

    return toLaunch.inputs;
  };

  const inputs = new Map<string, Primitive>();
  if (!!pipeline.inputs) {
    for (const [id, input] of pipeline.inputs) {
      let value = launchRequest.inputs?.get(id) || input.default;
      if (value !== undefined) {
        inputs.set(id, value);
        if (!!input.flows) {
          for (const [, flow] of input.flows) {
            const inputs = getNodeInputs(flow.to);
            inputs.set(flow.input, value);
          }
        }
      }
    }
  }

  const costs = new PipelineCosts({ pipeline: 0 });

  if (!!pipeline.script) {
    assign(costs, {
      pipeline: (await run(pipeline.script, {
        inputs: convertInputs({ pipeline })(inputs),
      })) as number,
    });
  } else {
    // calculate all nodes
    const nodes = new Map<string, NodeCosts>();
    for (const [id, node] of pipeline.nodes) {
      if (!node.script) {
        continue;
      }

      const inputs = (() => {
        let toLaunch = launchRequest.nodes.get(id);
        if (!toLaunch) {
          toLaunch = new NodeToLaunch();
          launchRequest.nodes.set(id, toLaunch);
        }
        toLaunch.inputs ??= new Map<string, Primitive>();
        toLaunch.outputs ??= new Map<string, Primitive>();

        return toLaunch.inputs;
      })();

      for (const [key, input] of node.inputs) {
        const value = inputs.get(key) || input.default;
        if (value !== undefined) {
          inputs.set(key, value);
        }
      }

      nodes.set(
        id,
        new NodeCosts({
          node: node.title,
          ...(await (async () => {
            const costs = await run(node.script, {
              inputs: convertInputs({ node })(inputs),
              environment: await getEnvironment({
                node,
                launchedBy: forUser,
              }),
            });
            if (typeof costs === "number") {
              return { costs: costs as number };
            }

            const nodeCosts = mapTo(costs as object, NodeCosts);
            await validate(nodeCosts);

            return nodeCosts;
          })()),
        })
      );
    }
    assign(costs, { nodes });
  }

  costs.convert().update();

  return costs;
}
