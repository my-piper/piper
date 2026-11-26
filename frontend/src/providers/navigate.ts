import { DOCUMENT } from "@angular/common";
import { inject, InjectionToken } from "@angular/core";

/** Leaves the app for a full-page URL, such as the single sign-on flow. */
export const NAVIGATE_TO = new InjectionToken<(url: string) => void>(
  "NAVIGATE_TO",
  {
    providedIn: "root",
    factory: () => {
      const document = inject(DOCUMENT);
      return (url: string) => document.location.assign(url);
    },
  },
);
