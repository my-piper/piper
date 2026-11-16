import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "is", pure: false })
export class IsPipe implements PipeTransform {
  transform(
    obj: unknown,
    type: abstract new (...args: never[]) => object,
  ): boolean {
    return obj instanceof type;
  }
}
