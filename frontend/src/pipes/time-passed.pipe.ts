import { Inject, Pipe, PipeTransform } from "@angular/core";
import { formatDistance, Locale } from "date-fns";
import { DATE_LOCALE } from "src/providers/date-locale";

@Pipe({
  name: "timePassed",
  standalone: false,
})
export class TimePassedPipe implements PipeTransform {
  constructor(@Inject(DATE_LOCALE) private locale: Locale) {}

  transform(date: Date): string {
    return formatDistance(date, new Date(), {
      includeSeconds: false,
      addSuffix: true,
      locale: this.locale,
    });
  }
}
