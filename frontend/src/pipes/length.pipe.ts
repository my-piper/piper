import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: "length",
  standalone: false,
})
export class LengthPipe implements PipeTransform {
  transform<T>(arr: T[]): number {
    return arr.length;
  }
}
