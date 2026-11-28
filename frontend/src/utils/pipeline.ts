import { Node, NodeEnvironment } from "src/models/node";
import { Pipeline } from "src/models/pipeline";

export type DeclaredVariables = Map<string, NodeEnvironment>;

/** Every Variable the pipeline's Nodes declare; a later Node wins. */
export function getDeclaredVariables(pipeline: Pipeline): DeclaredVariables {
  const variables: DeclaredVariables = new Map();
  for (const [, node] of pipeline.nodes) {
    for (const [key, declaration] of node.environment || []) {
      variables.set(key, declaration);
    }
  }
  return variables;
}

/**
 * Adds a Node under `id`; the first Node of a pipeline becomes its Start Node.
 */
export function addPipelineNode(pipeline: Pipeline, id: string, node: Node) {
  pipeline.nodes.set(id, node);
  if (pipeline.start.nodes.length <= 0) {
    pipeline.start.nodes.push(id);
  }
}

/**
 * Removes a Node with every Flow into or out of it (between Nodes, from
 * pipeline inputs, to pipeline outputs) and its Start Node mark. Flows can't
 * wait for `ProjectManager.sanitize()`: the template resolves flow ends
 * through the `node` pipe, which throws for unknown Nodes.
 */
export function removePipelineNode(pipeline: Pipeline, node: string) {
  const { nodes, flows, inputs, outputs, start } = pipeline;
  nodes.delete(node);
  for (const [id, flow] of flows) {
    if (flow.from === node || flow.to === node) {
      flows.delete(id);
    }
  }
  for (const [, input] of inputs || []) {
    for (const [id, flow] of input.flows || []) {
      if (flow.to === node) {
        input.flows.delete(id);
      }
    }
  }
  for (const [, output] of outputs || []) {
    for (const [id, flow] of output.flows || []) {
      if (flow.from === node) {
        output.flows.delete(id);
      }
    }
  }
  start.nodes = start.nodes.filter((id) => id !== node);
}
