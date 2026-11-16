import { Component, forwardRef, Input } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

/**
 * Stand-in for `<app-json-editor>` (src/app/json-editor): the same selector,
 * inputs and ControlValueAccessor contract, rendered as a JSON textarea.
 * `disable` is exposed as a data attribute so specs can assert permissions.
 *
 * Like the real editor (`use_default_values`), it fills every property it
 * shows but the value lacks with its type's default (`0`, `false`, `""`,
 * `{}`, `[]`) and reports the filled value as a change. With the
 * `required_only` feature (the default) it shows only required properties
 * and those the value already has.
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
  features: string[] = ["collapse", "required_only"];

  text = "";

  onChange: (value: object) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: object | null): void {
    const filled = withDefaults(
      this.schema,
      value ?? null,
      this.features.includes("required_only"),
    );
    this.text = JSON.stringify(filled);
    if (this.text !== JSON.stringify(value ?? null)) {
      // the real editor reports its defaults once it is ready
      queueMicrotask(() => this.onChange(filled as object));
    }
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

type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  default?: unknown;
  enum?: unknown[];
};

/** Mirrors json-editor's `getDefault` with `use_default_values: true`. */
function withDefaults(
  schema: Schema | undefined,
  value: unknown,
  requiredOnly: boolean,
): unknown {
  if (!schema) {
    return value;
  }
  if (value === undefined) {
    if (schema.default !== undefined) {
      return schema.default;
    }
    if (schema.enum !== undefined) {
      return schema.enum[0];
    }
    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    switch (type) {
      case "number":
      case "integer":
        return 0;
      case "boolean":
        return false;
      case "string":
        return "";
      case "object":
        return withDefaults(schema, {}, requiredOnly);
      case "array":
        return [];
      case "null":
        return null;
      default:
        return undefined;
    }
  }
  if (schema.properties && value !== null && typeof value === "object") {
    const filled = { ...(value as Record<string, unknown>) };
    for (const [key, property] of Object.entries(schema.properties)) {
      // `display_required_only` shows (and fills) only required properties
      // and those the value already has
      if (
        requiredOnly &&
        !(key in filled) &&
        !(schema.required || []).includes(key)
      ) {
        continue;
      }

      const child = withDefaults(property, filled[key], requiredOnly);
      if (child !== undefined) {
        filled[key] = child;
      }
    }
    return filled;
  }
  return value;
}

/** Replaces the stubbed editor value as if the user edited the JSON. */
export function editJson(element: HTMLElement, value: object) {
  const textarea = element.querySelector(
    "textarea.json-editor-stub",
  ) as HTMLTextAreaElement;
  textarea.value = JSON.stringify(value);
  textarea.dispatchEvent(new Event("input"));
}
