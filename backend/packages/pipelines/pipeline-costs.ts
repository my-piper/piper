import { MODULES_PATH } from "consts/core";
import { MODULES_FOLDER } from "consts/modules";
import { createLogger } from "core-kit/packages/logger";
import { mapTo } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import assign from "lodash/assign";
import { LaunchRequest, NodeToLaunch } from "models/launch-request";
import { NodeCosts, Pipeline, PipelineCosts } from "models/pipeline";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  createContext as createVmContext,
  Module,
  SourceTextModule,
} from "node:vm";
import path from "path";
import { NodeInputs } from "types/node";
import { Primitive } from "types/primitive";
import { convertInputs } from "utils/node";

const packagesLoader = createRequire(path.join(MODULES_PATH, "node_modules"));

const logger = createLogger("pipeline_costs");

async function run(code: string, inputs: NodeInputs): Promise<number | object> {
  try {
    const script = new SourceTextModule(code, {
      context: await createVmContext({
        require: (modulePath: string) => {
          const fullPath = packagesLoader.resolve(modulePath);
          // TODO: think how to flush cache
          // delete packagesLoader.cache[fullPath];
          return packagesLoader(modulePath);
        },
      }),
      importModuleDynamically: async (specifier: string): Promise<Module> => {
        const modulePath = pathToFileURL(
          path.join(MODULES_FOLDER, specifier)
        ).href;
        return import(modulePath);
      },
    });
    await script.link(() => null);
    await script.evaluate();
    const { costs: action } = script.namespace as {
      costs: ({ inputs }: { inputs: NodeInputs }) => Promise<number | object>;
    };
    if (typeof action !== "function") {
      return 0;
    }
    return await action({ inputs });
  } catch (err) {
    console.log(err);
    return 0;
  }
}

export async function getCosts(
  pipeline: Pipeline,
  launchRequest: LaunchRequest
): Promise<PipelineCosts> {
  const getNodeInputs = (id: string) => {
    let toLaunch = launchRequest.nodes.get(id);
    if (!toLaunch) {
      toLaunch = new NodeToLaunch({
        inputs: new Map<string, Primitive>(),
      });
      launchRequest.nodes.set(id, toLaunch);
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
    const converted = convertInputs({ pipeline })(inputs);
    assign(costs, {
      pipeline: (await run(pipeline.script, converted)) as number,
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
          toLaunch = new NodeToLaunch({
            inputs: new Map<string, Primitive>(),
          });
          launchRequest.nodes.set(id, toLaunch);
        }
        return toLaunch.inputs;
      })();

      for (const [key, input] of node.inputs) {
        const value = inputs.get(key) || input.default;
        if (value !== undefined) {
          inputs.set(key, value);
        }
      }

      const converted = convertInputs({ node })(inputs);
      nodes.set(
        id,
        new NodeCosts({
          node: node.title,
          ...(await (async () => {
            const costs = await run(node.script, converted);
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
