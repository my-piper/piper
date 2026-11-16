import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "is", pure: false })
export class IsPipe implements PipeTransform {
  transform(obj: object, type: new () => object): boolean {
    return obj instanceof type;
  }
}
