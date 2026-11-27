import { TuiDialogService } from "@taiga-ui/core";
import { TUI_CONFIRM, type TuiConfirmData } from "@taiga-ui/kit";
import { filter, type Observable } from "rxjs";

/**
 * Asks before a delete and emits once the user picks Delete; Cancel or
 * closing the dialog completes without emitting.
 *
 * `content` is HTML (TUI_CONFIRM binds it to innerHTML): escape values.
 */
export function confirmDelete(
  dialogs: TuiDialogService,
  label: string,
  content: string,
): Observable<boolean> {
  return dialogs
    .open<boolean>(TUI_CONFIRM, {
      label,
      size: "s",
      data: {
        content,
        yes: $localize`:@@action.delete:Delete`,
        no: $localize`:@@action.cancel:Cancel`,
        // A named primary action, then a ghost Cancel (docs/design.md, #298).
        appearance: ["primary-destructive", "flat-grayscale"],
      } satisfies TuiConfirmData,
    })
    .pipe(filter(Boolean));
}
