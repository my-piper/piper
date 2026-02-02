import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "parseJson" })
export class ParseJsonPipe implements PipeTransform {
  transform(obj: string): object {
    return JSON.parse(obj);
  }
}
