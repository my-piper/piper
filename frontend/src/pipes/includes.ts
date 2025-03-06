import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "includes", pure: false })
export class IncludesPipe implements PipeTransform {
  transform(arr: any[], val: any): boolean {
    return arr?.includes(val);
  }
}
