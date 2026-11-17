import { NodeEnvironment } from "src/models/node";
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
