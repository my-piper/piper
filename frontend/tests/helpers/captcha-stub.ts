import { Component, forwardRef, Input } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

/**
 * Stand-in for ng-hcaptcha's `<ng-hcaptcha>`: the same selector, `siteKey`
 * input and ControlValueAccessor contract, without loading the hCaptcha
 * script. `solve()` reports a token exactly as the widget does after a
 * successful challenge.
 */
@Component({
  selector: "ng-hcaptcha",
  standalone: true,
  template: `<div class="hcaptcha-stub" [attr.data-site-key]="siteKey"></div>`,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => HcaptchaStubComponent),
      multi: true,
    },
  ],
})
export class HcaptchaStubComponent implements ControlValueAccessor {
  @Input()
  siteKey: string | null = null;

  value: string | null = null;

  onChange: (value: string | null) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value = value;
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  solve(token: string) {
    this.value = token;
    this.onChange(token);
    this.onTouched();
  }
}
