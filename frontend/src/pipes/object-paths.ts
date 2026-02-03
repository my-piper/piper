import { Pipe, PipeTransform } from "@angular/core";
import { isArray, isPlainObject } from "lodash";

function objectPaths(value: any, prefix: string = ""): string[] {
  if (isArray(value)) {
    return value.flatMap((v, i) => objectPaths(v, `${prefix}[${i}]`));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([key, v]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return objectPaths(v, path);
    });
  }

  return prefix ? [prefix] : [];
}

@Pipe({ name: "objectPaths" })
export class ObjectPathsPipe implements PipeTransform {
  transform(obj: object): string[] {
    return objectPaths(obj);
  }
}
