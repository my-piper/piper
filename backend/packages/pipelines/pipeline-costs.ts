import { createLogger } from "core-kit/packages/logger";
import { mapTo, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { getEnvironment } from "jobs/process-node/environment";
import assign from "lodash/assign";
import { Environment } from "models/environment";
import { LaunchRequest, NodeToLaunch } from "models/launch-request";
import { NodeCosts, Pipeline, PipelineCosts } from "models/pipeline";
import { User } from "models/user";
import {
  Context,
  createContext as createVmContext,
  SourceTextModule,
} from "node:vm";
import { importModule, requireModule } from "packages/vm/utils";
import { NodeInputs } from "types/node";
import { Primitive } from "types/primitive";
import { convertInputs } from "utils/node";

const logger = createLogger("pipeline_costs");

async function run(
  code: string,
  { environment, inputs }: { environment?: Environment; inputs: NodeInputs }
): Promise<number | object> {
  let script: SourceTextModule;
  let context: Context;
  try {
    logger.debug("Create VM context");
    context = createVmContext({
      require: requireModule,
    });
    logger.debug("Create module");
    script = new SourceTextModule(code, {
      context,
      importModuleDynamically: importModule,
    });
    await script.link(() => null);
    await script.evaluate();
    const { costs: action } = script.namespace as {
      costs: (data: {
        env?: object;
        inputs: NodeInputs;
      }) => Promise<number | object>;
    };
    if (typeof action !== "function") {
      return 0;
    }
    return await action({
      ...(!!environment ? { env: toPlain(environment) } : {}),
      inputs,
    });
  } catch (err) {
    console.log(err);
    return 0;
  } finally {
    logger.debug("Clear resource");
    [context, script] = [null, null];
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

            if (!("costs" in costs)) {
              throw new DataError("Costs function should have [costs] field");
            }

            return mapTo(costs as object, NodeCosts);
          })()),
        })
      );
    }
    assign(costs, { nodes });
  }

  costs.convert().update();

  return costs;
}
