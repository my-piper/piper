import { Pipe, PipeTransform } from "@angular/core";
import { values } from "lodash";

@Pipe({ name: "values" })
export class ValuesPipe implements PipeTransform {
  transform(obj: any): any[] {
    if (obj instanceof Map) {
      return [...obj.values()];
    }
    return values(obj);
  }
}
