import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "slice", pure: false })
export class SlicePipe implements PipeTransform {
  transform(arr: any[], count: number, start: number = 0): any[] {
    return arr.slice(start, start + count);
  }
}
