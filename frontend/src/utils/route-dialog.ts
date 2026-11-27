import { ActivatedRoute, Data } from "@angular/router";
import { Languages } from "src/enums/languages";
import { getLabel } from "src/utils/i18n";

/**
 * A child route rendered inside its parent's `tuiDialog` names the dialog
 * through `data.dialogLabel` (#347): text, or a function of the route's data
 * (resolved data included) for titles that carry a name.
 */
export type DialogLabel = string | ((data: Data) => string);

export function dialogLabel(route: ActivatedRoute): string | undefined {
  const data = route.firstChild?.snapshot.data;
  const label = data?.["dialogLabel"] as DialogLabel | undefined;
  return typeof label === "function" ? label(data) : label;
}

/** `prefix`, then the Localized Text `title` in English, when there is one. */
export function titled(prefix: string, title: string | undefined): string {
  const name = title ? getLabel(title, Languages.en) : "";
  return name ? `${prefix}: ${name}` : prefix;
}
