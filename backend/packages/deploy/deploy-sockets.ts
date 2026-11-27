import { toInstance } from "core-kit/packages/transform";
import pick from "lodash/pick";
import { Deploy } from "models/deploy";
import { NodeInput, NodeOutput } from "models/node";
import { Pipeline } from "models/pipeline";

// what a node input or output can hold of a pipeline one; flows and arrange
// belong to the pipeline, the canvas positions sockets itself
const INPUT_FIELDS = [
  "order",
  "type",
  "title",
  "description",
  "required",
  "enum",
  "freeform",
  "multiline",
  "min",
  "max",
  "step",
  "default",
  "placeholder",
] as const;
const OUTPUT_FIELDS = ["title", "type"] as const;

export type DeploySockets = {
  inputs: Map<string, NodeInput>;
  outputs: Map<string, NodeOutput>;
};

function socket<T>(
  id: string,
  source: object,
  fields: readonly string[],
  type: new () => T
): T {
  const plain = pick(source, fields) as { title?: string };
  return toInstance({ ...plain, title: plain.title || id }, type);
}

/**
 * The inputs and outputs a Node running this Deploy has: its pipeline's inputs
 * and outputs, keyed by the same ids, titled by their id when untitled.
 */
export function deploySockets({ pipeline }: Deploy): DeploySockets {
  const { inputs, outputs } = pipeline ?? new Pipeline();
  return {
    inputs: new Map(
      [...(inputs ?? new Map())].map(([id, input]) => [
        id,
        socket(id, input, INPUT_FIELDS, NodeInput),
      ])
    ),
    outputs: new Map(
      [...(outputs ?? new Map())].map(([id, output]) => [
        id,
        socket(id, output, OUTPUT_FIELDS, NodeOutput),
      ])
    ),
  };
}
