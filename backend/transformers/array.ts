import { TransformationType } from "core-kit/packages/transform";

export const arrayTransformer =
  <T>() =>
  ({ value, type }: { value: T | T[]; type: TransformationType }) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS:
      case TransformationType.CLASS_TO_PLAIN:
        if (Array.isArray(value)) {
          return value;
        }

        return !!value ? [value] : [];
      default:
        throw new Error("It is not supported");
    }
  };
