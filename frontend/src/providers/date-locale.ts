import { InjectionToken } from "@angular/core";
import { Locale } from "date-fns";
import { enUS } from "date-fns/locale";

/** date-fns locale for relative times; Piper is built in English only. */
export const DATE_LOCALE = new InjectionToken<Locale>("date_locale", {
  factory: () => enUS,
});
