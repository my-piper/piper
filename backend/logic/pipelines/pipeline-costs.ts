import assign from "lodash/assign";
import { SourceTextModule } from "node:vm";
import { NodeInputs } from "types/node";
import { convertInputs } from "utils/node";
import { LaunchRequest, NodeToLaunch } from "../../models/launch-request";
import { NodeCosts, Pipeline, PipelineCosts } from "../../models/pipeline";
import { Primitive } from "../../types/primitive";

async function run(code: string, inputs: NodeInputs): Promise<number> {
  const script = new SourceTextModule(code);
  await script.link(() => null);

  script.evaluate();
  const { costs: action } = script.namespace as {
    costs: ({ inputs }: { inputs: NodeInputs }) => Promise<number>;
  };
  if (typeof action !== "function") {
    return 0;
  }
  return (await action({ inputs })) as number;
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
    assign(costs, { pipeline: await run(pipeline.script, converted) });
  } else {
    // calculate all nodes
    const nodes = [];
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
      nodes.push(
        new NodeCosts({
          node: node.title,
          costs: await run(node.script, converted),
        })
      );
    }
    assign(costs, { nodes });
  }

  costs.update();
  return costs;
}
