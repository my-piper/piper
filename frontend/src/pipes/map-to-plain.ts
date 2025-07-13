import { Pipe, PipeTransform } from "@angular/core";
import { Primitive } from "src/types/primitive";

@Pipe({ name: "mapToPlain", pure: false })
export class MapToPlainPipe implements PipeTransform {
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
