import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "is", pure: false })
export class IsPipe implements PipeTransform {
  transform(obj: Object, type: new () => Object): boolean {
    return obj instanceof type;
  }
}
