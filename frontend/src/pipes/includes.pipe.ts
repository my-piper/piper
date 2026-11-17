import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: "includes",
  pure: false,
  standalone: false,
})
export class IncludesPipe implements PipeTransform {
  transform(arr: unknown[], val: unknown): boolean {
    return (arr || []).includes(val);
  }
}
