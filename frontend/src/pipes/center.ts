import { Pipe, PipeTransform } from "@angular/core";

type Point = { x: number; y: number };

@Pipe({ name: "center" })
export class CenterPipe implements PipeTransform {
  transform({ x: x1, y: y1 }: Point, { x: x2, y: y2 }: Point): Point {
    const dx = x2 - x1;
    const dy = y2 - y1;

    return {
      x: x1 + dx / 2,
      y: y1 + dy / 2,
    };
  }
}
