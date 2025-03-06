import { Pipe, PipeTransform } from "@angular/core";
import first from "lodash/first";

@Pipe({ name: "first" })
export class FirstPipe implements PipeTransform {
  transform(arr: any[]): any {
    return first(arr);
  }
}
