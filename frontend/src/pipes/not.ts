import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "not" })
export class NotPipe implements PipeTransform {
  transform(value: boolean): boolean {
    return !value;
  }
}
