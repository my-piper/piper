import { InjectionToken } from "@angular/core";
import { Languages } from "src/enums/languages";

/**
 * The language Localized Texts resolve to. Piper is built in English only;
 * Localized Texts may still carry other languages, which it does not show.
 */
export const CURRENT_LANGUAGE = new InjectionToken<Languages>(
  "current_language",
  { factory: () => Languages.en },
);
