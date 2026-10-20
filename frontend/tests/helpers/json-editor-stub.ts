import { Component, forwardRef, Input } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

/**
 * Stand-in for `<app-json-editor>` (src/app/json-editor): the same selector,
 * inputs and ControlValueAccessor contract, rendered as a JSON textarea.
 * `disable` is exposed as a data attribute so specs can assert permissions.
 */
@Component({
  selector: "app-json-editor",
  standalone: true,
  template: `<textarea
    class="json-editor-stub"
    [attr.data-disable]="disable.join(',')"
    [value]="text"
    (input)="type($any($event.target).value)"
  ></textarea>`,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => JsonEditorStubComponent),
      multi: true,
    },
  ],
})
export class JsonEditorStubComponent implements ControlValueAccessor {
  @Input()
  schema: object;

  @Input()
  disable: string[] = [];

  @Input()
  features: string[] = [];

  text = "";

  onChange: (value: object) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: object | null): void {
    this.text = JSON.stringify(value ?? null);
  }

  registerOnChange(fn: (value: object) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  type(text: string) {
    this.text = text;
    this.onChange(JSON.parse(text));
  }
}

/** Replaces the stubbed editor value as if the user edited the JSON. */
export function editJson(element: HTMLElement, value: object) {
  const textarea = element.querySelector(
    "textarea.json-editor-stub",
  ) as HTMLTextAreaElement;
  textarea.value = JSON.stringify(value);
  textarea.dispatchEvent(new Event("input"));
}
