import { Pipe, PipeTransform } from "@angular/core";
import * as YAML from "yaml";

@Pipe({ name: "yaml", pure: false })
export class YamlPipe implements PipeTransform {
  transform(obj: Object): string {
    return YAML.stringify(obj, {
      lineWidth: 0,
    });
  }
}
