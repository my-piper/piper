import { Provider } from "@angular/core";
import { tuiValidationErrorsProvider } from "@taiga-ui/core";

/**
 * The app-wide messages `<tui-error>` shows for a field's validation errors,
 * keyed by the error's name. A form overrides one with its own
 * `tuiValidationErrorsProvider` in the component's `providers`.
 */
export function provideValidationErrors(): Provider {
  return tuiValidationErrorsProvider({
    required: $localize`:@@message.field_required:This field is required.`,
    minlength: ({ requiredLength }: { requiredLength: number }) =>
      $localize`:@@message.min_length:Min length ${requiredLength}:length: characters.`,
    email: $localize`:@@message.invalid_email:Enter a valid email.`,
    pattern: $localize`:@@message.invalid_format:Invalid format.`,
    passwordMismatch: $localize`:@@message.password_mismatch:Passwords do not match.`,
  });
}
