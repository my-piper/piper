import { TransformationType } from "class-transformer";
import { toInstance, toPlain } from "core-kit/utils/models";

export const objectsMapTransformer =
  <T>(model: new () => T) =>
  ({
    value,
    type,
  }: {
    value: { [key: string]: Object } | Map<string, T>;
    type: TransformationType;
  }) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        if (value === null || value === undefined) {
          return value;
        }
        const map = new Map<string, T>();
        const entries = Object.entries(value as { [key: string]: Object });
        for (const [key, val] of entries) {
          map.set(key, toInstance(val, model));
        }
        return map;
      }
      case TransformationType.CLASS_TO_PLAIN: {
        if (value === null || value === undefined) {
          return value;
        }
        const obj: { [key: string]: Object } = {};
        for (const [key, val] of value as Map<string, T>) {
          obj[key] = toPlain(val);
        }
        return obj;
      }
      default:
        throw new Error("It is not supported");
    }
  };
