import { createLogger } from "core-kit/packages/logger";
import get from "lodash/get";
import { NodeInput, NodeOutput } from "models/node";
import { NodeFlow } from "models/node-flow";
import { Primitive } from "types/primitive";

const logger = createLogger("flow-value");

// a value read by a JSON path, coerced to the type of the input it fills
function coerce(value: unknown, type: string): Primitive | undefined {
  switch (type) {
    case "boolean":
      return Boolean(value);
    case "integer":
      if (typeof value === "number") {
        return value;
      }
      return typeof value === "string" ? parseInt(value) : undefined;
    case "float":
      if (typeof value === "number") {
        return value;
      }
      return typeof value === "string" ? parseFloat(value) : undefined;
    case "string":
      if (typeof value === "string") {
        return value;
      }
      return typeof value === "number" ? value.toString() : undefined;
    case "json":
      return typeof value === "object" ? JSON.stringify(value) : undefined;
    default:
      return undefined;
  }
}

/**
 * The value a Flow carries from a Node output to a Node input, after its
 * transformer, or undefined when it carries none: a `json` transformer whose
 * path is missing or does not fit the input type, or a transformer that does
 * not apply to these socket types.
 */
export function flowValue(
  flow: Pick<NodeFlow, "transformer">,
  output: Pick<NodeOutput, "type">,
  input: Pick<NodeInput, "type">,
  value: Primitive
): Primitive | undefined {
  switch (flow.transformer?.type) {
    case "json": {
      const { path } = flow.transformer;
      if (!path) {
        return undefined;
      }
      let json: object;
      try {
        json = JSON.parse(value as string) as object;
      } catch (e) {
        logger.error(e);
        return undefined;
      }
      const fromPath: unknown = get(json, path);
      return fromPath === undefined ? undefined : coerce(fromPath, input.type);
    }
    case "array": {
      if (output.type !== "image[]" || input.type !== "image") {
        return undefined;
      }
      const array = (value as string).split("|");
      return array[Math.min(array.length - 1, flow.transformer.index)] || null;
    }
    default:
      return value;
  }
}
