import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
  ChangeDetectionStrategy,
  inject,
} from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { TUI_VALIDATION_ERRORS } from "@taiga-ui/core";
import { TuiValidationError } from "@taiga-ui/cdk";
import { delay, finalize } from "rxjs";
import { ChangePasswordRequest } from "src/models/change-password-request";
import { AppError } from "src/models/errors";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/consts/ui";
import { mapTo, toPlain } from "src/utils/models";

export function passwordMatchValidator(
  form: AbstractControl,
): ValidationErrors | null {
  const password = form.get("password")?.value;
  const confirmPassword = form.get("confirmPassword")?.value;
  if (password !== confirmPassword) {
    return { passwordMismatch: true };
  }

  return null;
}

@Component({
  selector: "app-change-password",
  templateUrl: "./change-password.component.html",
  styleUrls: ["./change-password.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ChangePasswordComponent {
  progress = { changing: false };
  error!: AppError;

  @Output()
  changed = new EventEmitter();

  /** The app-wide message for the form-level `passwordMismatch` error. */
  readonly mismatchError = new TuiValidationError(
    inject(TUI_VALIDATION_ERRORS)["passwordMismatch"],
  );

  form = this.fb.group(
    {
      password: this.fb.control<string | null>(null, [
        Validators.required,
        Validators.minLength(6),
      ]),
      confirmPassword: this.fb.control<string | null>(null, [
        Validators.required,
        Validators.minLength(6),
      ]),
    },
    { validators: passwordMatchValidator },
  );

  /** The passwords differ once the user has touched the form. */
  get mismatch(): boolean {
    return this.form.touched && !!this.form.errors?.["passwordMismatch"];
  }

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private cd: ChangeDetectorRef,
  ) {}

  changePassword() {
    this.form.markAllAsTouched();
    if (!this.form.valid) {
      return;
    }

    this.progress.changing = true;
    this.cd.detectChanges();

    const request = mapTo(this.form.getRawValue(), ChangePasswordRequest);
    this.http
      .post("me/change-password", toPlain(request))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.changing = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: () => this.changed.emit(),
        error: (err) => (this.error = err),
      });
  }
}
