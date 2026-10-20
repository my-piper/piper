import { Component, forwardRef, Input } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

/**
 * Stand-in for ngx-monaco-editor's `<ngx-monaco-editor>`: the same selector,
 * `options` input and ControlValueAccessor contract, rendered as a textarea so
 * specs can read and type text. Real Monaco is exercised by the browser suite.
 */
@Component({
  selector: "ngx-monaco-editor",
  standalone: true,
  template: `<textarea
    class="monaco-stub"
    [attr.data-language]="options?.language"
    [value]="value"
    [disabled]="disabled"
    (input)="type($any($event.target).value)"
    (blur)="onTouched()"
  ></textarea>`,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MonacoEditorStubComponent),
      multi: true,
    },
  ],
})
export class MonacoEditorStubComponent implements ControlValueAccessor {
  @Input()
  options: { language?: string; [key: string]: unknown } = {};

  value = "";
  disabled = false;

  onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value = value ?? "";
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }

  type(value: string) {
    this.value = value;
    this.onChange(value);
  }
}

/** Replaces the text of a stubbed editor as if the user typed it. */
export function typeInto(textarea: HTMLTextAreaElement, text: string) {
  textarea.value = text;
  textarea.dispatchEvent(new Event("input"));
}
