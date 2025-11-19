import { Pipe, PipeTransform } from "@angular/core";

type Point = { x: number; y: number };

@Pipe({ name: "position" })
export class PositionPipe implements PipeTransform {
  transform({ x, y }: Point) {
    return {
      "top.px": y,
      "left.px": x,
    };
  }
}
