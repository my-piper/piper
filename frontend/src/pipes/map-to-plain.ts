import { Pipe, PipeTransform } from "@angular/core";
import { Primitive } from "src/types/primitive";

@Pipe({ name: "plain", pure: false })
export class PlainPipe implements PipeTransform {
  transform(map: Map<string, Primitive> | null): { [key: string]: Primitive } {
    if (!map) {
      return null;
    }
    const plain: { [key: string]: any } = {};
    for (const [k, value] of map) {
      plain[k] = value;
    }
    return plain;
  }
}
