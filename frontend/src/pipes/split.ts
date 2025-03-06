import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "split", pure: false })
export class SplitPipe implements PipeTransform {
  transform(source: string, separator: string): string[] {
    return source.split(separator);
  }
}
