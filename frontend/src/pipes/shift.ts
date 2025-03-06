import { Pipe, PipeTransform } from "@angular/core";

type Point = { x: number; y: number };
type Shift = { x?: number; y?: number };

@Pipe({ name: "shift", pure: false })
export class ShiftPipe implements PipeTransform {
  transform({ x, y }: Point, { x: shiftX, y: shiftY }: Shift): Point {
    return { x: x + (shiftX || 0), y: y + (shiftY || 0) };
  }
}
