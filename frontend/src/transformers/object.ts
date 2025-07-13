import { TransformationType } from "class-transformer";

export function objectTransformer({
  value,
  type,
}: {
  value: object;
  type: TransformationType;
}) {
  switch (type) {
    case TransformationType.PLAIN_TO_CLASS: {
      return value as object;
    }
    case TransformationType.CLASS_TO_PLAIN: {
      return value as object;
    }
    default:
      throw new Error("It is not supported");
  }
}
