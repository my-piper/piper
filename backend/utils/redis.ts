import { Primitive } from "types/primitive";

const NULL_VALUE = "<!null!>";

export function toRedisValue(type: string, value: Primitive | null): string {
  if (value === null) {
    return NULL_VALUE;
  }
  switch (type) {
    case "boolean":
      return <boolean>value ? "1" : "";
    case "integer":
    case "float":
    case "image":
    case "image[]":
    case "archive":
    case "audio":
    case "video":
    case "json":
    case "string":
    case "string[]":
      return `${value}`;
    default:
      throw new Error(`Wrong type ${type}`);
  }
}

export function fromRedisValue(type: string, value: string): Primitive | null {
  if (value === NULL_VALUE) {
    return null;
  }
  switch (type) {
    case "boolean":
      return !!value;
    case "integer":
      return parseInt(value);
    case "float":
      return parseFloat(value);
    case "image":
    case "image[]":
    case "archive":
    case "audio":
    case "video":
    case "json":
    case "string":
    case "string[]":
      return value;
    default:
      throw new Error(`Wrong type ${type}`);
  }
}
