import { Pipe, PipeTransform } from "@angular/core";
import * as YAML from "yaml";

@Pipe({
  name: "yaml",
  pure: false,
  standalone: false,
})
export class YamlPipe implements PipeTransform {
  transform(obj: object): string {
    return YAML.stringify(obj, {
      lineWidth: 0,
    });
  }
}
