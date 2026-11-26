import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { TuiButton, TuiDialog } from "@taiga-ui/core";
import { DisplayError } from "src/models/errors";

/**
 * A blocking error message in a Taiga dialog, closed with OK (or Esc / the
 * close button), formerly ui-kit's app-informer (#199). It opens while
 * `error` is set and emits `closed` when dismissed; hosts clear the error.
 */
@Component({
  selector: "app-error-dialog",
  imports: [TuiButton, TuiDialog],
  templateUrl: "./error-dialog.component.html",
  styleUrls: ["./error-dialog.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorDialogComponent {
  readonly error = input<DisplayError | null | undefined>(null);
  readonly closed = output<void>();

  /** API validation details, shown one per line under the message. */
  details(error: DisplayError): unknown[] {
    const { details } = error;
    return details == null ? [] : Array.isArray(details) ? details : [details];
  }
}
