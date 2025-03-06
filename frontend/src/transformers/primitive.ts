import { TransformationType } from "class-transformer";
import { Primitive } from "src/types/primitive";

export function primitiveMapTransformer({
  value,
  type,
}: {
  value: { [key: string]: Primitive } | Map<string, Primitive>;
  type: TransformationType;
}) {
  switch (type) {
    case TransformationType.PLAIN_TO_CLASS: {
      if (value === undefined) {
        return undefined;
      }
      if (value === null) {
        return null;
      }
      const source = value as { [key: string]: Primitive };
      const map = new Map<string, Primitive>();
      for (const key of Object.keys(source)) {
        map.set(key, source[key]);
      }
      return map;
    }
    case TransformationType.CLASS_TO_PLAIN: {
      if (value === undefined) {
        return undefined;
      }
      if (value === null) {
        return null;
      }
      const source = value as Map<string, Primitive>;
      const obj: { [key: string]: Primitive } = {};
      for (const [k, v] of source) {
        obj[k] = v;
      }
      return obj;
    }
    default:
      throw new Error("It is not supported");
  }
}

export function primitiveTransformer({
  value,
  type,
}: {
  value: Primitive;
  type: TransformationType;
}) {
  switch (type) {
    case TransformationType.PLAIN_TO_CLASS: {
      return value;
    }
    case TransformationType.CLASS_TO_PLAIN: {
      return value;
    }
    default:
      throw new Error("It is not supported");
  }
}

export function primitiveArrayTransformer({
  value,
  type,
}: {
  value: { [key: string]: Primitive }[];
  type: TransformationType;
}) {
  switch (type) {
    case TransformationType.PLAIN_TO_CLASS: {
      return value;
    }
    case TransformationType.CLASS_TO_PLAIN: {
      return value;
    }
    default:
      throw new Error("It is not supported");
  }
}
