import { pickBy } from "lodash";

export function shrink(obj: object): object {
  return pickBy(obj, (value) => value !== undefined);
}
