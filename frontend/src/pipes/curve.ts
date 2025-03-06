import { Pipe, PipeTransform } from "@angular/core";

type Point = { x: number; y: number };

@Pipe({ name: "curve", pure: false })
export class CurvePipe implements PipeTransform {
  transform({ x: x1, y: y1 }: Point, { x: x2, y: y2 }: Point): string {
    const horizontalOffset = x2 - x1 + y2 - y1 > 150 ? 150 : 0;
    const verticalOffset = (y2 - y1) * 0.25;

    // If Box B is to the left of Box A, adjust the control points accordingly
    if (x1 > x2) {
      const controlPoint1 = {
        x: x1 + horizontalOffset,
        y: y1 + verticalOffset,
      };
      const controlPoint2 = {
        x: x2 - horizontalOffset,
        y: y2 - verticalOffset,
      };
      return `M ${x1},${y1} C ${controlPoint1.x},${controlPoint1.y} ${controlPoint2.x},${controlPoint2.y} ${x2},${y2}`;
    } else {
      // If Box B is to the right of Box A
      const controlPoint1 = {
        x: x1 + horizontalOffset,
        y: y1 + verticalOffset,
      };
      const controlPoint2 = {
        x: x2 - horizontalOffset,
        y: y2 - verticalOffset,
      };
      return `M ${x1},${y1} C ${controlPoint1.x},${controlPoint1.y} ${controlPoint2.x},${controlPoint2.y} ${x2},${y2}`;
    }
  }
}
