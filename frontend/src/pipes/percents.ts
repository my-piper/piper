import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: "getPercent",
  standalone: false,
})
export class GetPercentPipe implements PipeTransform {
  transform(value: number, min: number, max: number): number {
    const current = ((value - min) * 100) / (max - min);
    return Math.min(Math.max(current, 0), 100);
  }
}
