import { Pipe, PipeTransform } from "@angular/core";

type Point = { x: number; y: number };

@Pipe({
  name: "multiply",
  standalone: false,
})
export class MultiplyPipe implements PipeTransform {
  transform({ x, y }: Point, factor: number): Point {
    return {
      x: x / factor,
      y: y / factor,
    };
  }
}
