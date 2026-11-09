import { Pipe, PipeTransform } from "@angular/core";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

// compact duration of a run: 350ms, 4.2s, 3m 05s, 1h 20m
export function formatRunDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return "—";
  }
  ms = Math.max(0, Math.round(ms));
  if (ms < SECOND) {
    return `${ms}ms`;
  }
  if (ms < MINUTE) {
    const seconds = ms / SECOND;
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }
  if (ms < HOUR) {
    const minutes = Math.floor(ms / MINUTE);
    const seconds = Math.floor((ms % MINUTE) / SECOND);
    return `${minutes}m ${`${seconds}`.padStart(2, "0")}s`;
  }
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  return `${hours}h ${`${minutes}`.padStart(2, "0")}m`;
}

@Pipe({ name: "runDuration" })
export class RunDurationPipe implements PipeTransform {
  transform(ms: number | null | undefined): string {
    return formatRunDuration(ms);
  }
}
