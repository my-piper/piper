import { Pipe, PipeTransform } from "@angular/core";
import { formatDuration, intervalToDuration } from "date-fns";

const formatDistanceLocale = {
  xSeconds: "{{count}}s",
  xMinutes: "{{count}}m",
  xHours: "{{count}}h",
};
const shortEnLocale = {
  formatDistance: (token: "xSeconds" | "xMinutes" | "xHours", count: number) =>
    formatDistanceLocale[token].replace("{{count}}", `${count}`),
};

@Pipe({ name: "duration" })
export class DurationPipe implements PipeTransform {
  transform(seconds: number): string {
    return formatDuration(
      intervalToDuration({ start: 0, end: seconds * 1000 }),
      { format: ["hours", "minutes", "seconds"], locale: shortEnLocale }
    );
  }
}
