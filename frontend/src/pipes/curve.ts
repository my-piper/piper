import { Pipe, PipeTransform } from "@angular/core";

type Point = { x: number; y: number };

@Pipe({ name: "curve" })
export class CurvePipe implements PipeTransform {
  transform({ x: x1, y: y1 }: Point, { x: x2, y: y2 }: Point): string {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 150) {
      return `M ${x1},${y1} L ${x2},${y2}`;
    }

    const horizontalOffset = 150;
    const verticalOffset = dy * 0.25;

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
