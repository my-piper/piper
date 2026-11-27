import { Pipe, PipeTransform } from "@angular/core";

type Point = { x: number; y: number };

/** Control points never sit closer than this to their end. */
const MIN_HANDLE = 40;

/**
 * SVG path of a wire from an output (left end) to an input (right end): a
 * horizontal bezier whose handles reach half the horizontal distance, so
 * short and backward wires still leave and enter their sockets sideways.
 */
@Pipe({
  name: "curve",
  standalone: false,
})
export class CurvePipe implements PipeTransform {
  transform({ x: x1, y: y1 }: Point, { x: x2, y: y2 }: Point): string {
    const handle = Math.max(MIN_HANDLE, Math.abs(x2 - x1) / 2);
    return `M ${x1},${y1} C ${x1 + handle},${y1} ${x2 - handle},${y2} ${x2},${y2}`;
  }
}
