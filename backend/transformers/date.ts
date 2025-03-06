import { TransformationType } from "class-transformer";
import { format, fromUnixTime, getUnixTime, isValid, parse } from "date-fns";

const DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

export const dateTransformer =
  (dateFormat: "unixtime" | string = DATE_FORMAT) =>
  ({
    value,
    type,
  }: {
    value: string | number | null | Date;
    type: TransformationType;
  }) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        const source = value as string | null;
        if (!!source) {
          if (dateFormat === "unixtime") {
            return fromUnixTime((value as number) / 1000);
          }

          const date = parse(source, dateFormat, new Date());
          return isValid(date) ? date : null;
        }
        return null;
      }
      case TransformationType.CLASS_TO_PLAIN: {
        const date = value as Date | null | undefined;
        return !!date
          ? dateFormat === "unixtime"
            ? getUnixTime(date)
            : format(date, dateFormat)
          : undefined;
      }
      default:
        throw new Error("It is not supported");
    }
  };
