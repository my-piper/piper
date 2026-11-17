import { Inject, Pipe, PipeTransform } from "@angular/core";
import {
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  Locale,
} from "date-fns";
import { DATE_LOCALE } from "src/providers/date-locale";

@Pipe({
  name: "timeDiff",
  pure: false,
  standalone: false,
})
export class TimeDiffPipe implements PipeTransform {
  constructor(@Inject(DATE_LOCALE) private locale: Locale) {}

  transform(date: Date, base: "s" | "m" | "h" = "s"): number {
    switch (base) {
      case "s":
        return differenceInSeconds(new Date(), date);
      case "m":
        return differenceInMinutes(new Date(), date);
      case "h":
        return differenceInHours(new Date(), date);
    }
  }
}
