import { Pipe, PipeTransform } from "@angular/core";
import formatDistance from "date-fns/formatDistance";

@Pipe({ name: "formatDistance" })
export class FormatDistancePipe implements PipeTransform {
  transform(start: Date, end: Date = new Date()): string {
    return formatDistance(start, end, {
      includeSeconds: false,
      addSuffix: false,
    });
  }
}
