import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: "parseJson",
  standalone: false,
})
export class ParseJsonPipe implements PipeTransform {
  transform(obj: string): object {
    return JSON.parse(obj);
  }
}
