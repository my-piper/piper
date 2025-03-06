import { TransformationType } from "class-transformer";
import { format, isValid, parse } from "date-fns";

const DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

export const dateTransformer =
  (dateFormat = DATE_FORMAT) =>
  ({
    value,
    type,
  }: {
    value: string | null | Date;
    type: TransformationType;
  }) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        const source = value as string | null;
        if (!!source) {
          const date = parse(source, dateFormat, new Date());
          return isValid(date) ? date : null;
        }
        return null;
      }
      case TransformationType.CLASS_TO_PLAIN: {
        const date = value as Date | null;
        return date !== null ? format(date, dateFormat) : null;
      }
      default:
        throw new Error("It is not supported");
    }
  };
