import { NodeInput, NodeOutput } from "src/models/node";

export function matchIO(output: NodeOutput, input: NodeInput) {
  switch (output.type) {
    case "json":
      console.log(output.schema, ">", input.schema?.id);
      return input.type === "json" && output.schema === input.schema?.id;
    default:
      return output.type === input.type;
  }
}
