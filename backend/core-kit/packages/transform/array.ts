import { TransformationType } from "class-transformer";

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

const COMMA = ",";

export const commaArrayTransformer = ({
  value,
  type,
}: {
  value: string | string[];
  type: TransformationType;
}) => {
  switch (type) {
    case TransformationType.PLAIN_TO_CLASS:
      if (Array.isArray(value)) {
        return value;
      }

      return !!value ? value.split(COMMA) : [];
    case TransformationType.CLASS_TO_PLAIN:
    default:
      const arr = value as string[];
      return arr.join(COMMA);
  }
};
