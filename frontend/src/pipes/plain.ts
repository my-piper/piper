import { Pipe, PipeTransform } from "@angular/core";
import { toPlain } from "src/utils/models";

@Pipe({ name: "plain" })
export class PlainPipe implements PipeTransform {
  transform<T>(obj: T): object {
    return toPlain(obj);
  }
}
