import {
  AbstractControl,
  FormBuilder,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { HIDDEN_STRING } from "src/consts/core";
import { Primitive } from "src/types/primitive";

export type VariableType = "string" | "number" | "boolean";

/** Where a Variable the Project doesn't set is read from. */
export type VariableSource = "user" | "platform" | "none";

/** What a row shows besides its editable name, type and value. */
export interface VariableMeta {
  /** The value is stored server-side: an empty input keeps it. */
  stored: boolean;
  /** Name and type come from a Node declaration. */
  fixed: boolean;
  /** The value can't be set here. */
  readonly: boolean;
  description?: string | null;
  /** Shown when the row has no value of its own. */
  inherited?: { source: VariableSource; value?: Primitive };
}

/** Maps a declared or `typeof` type name onto a Variable type. */
export function variableType(name: string): VariableType {
  switch (name) {
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

/** A value must parse as its type; empty is always allowed (keep / unset). */
function valueMatchesType(group: AbstractControl): ValidationErrors | null {
  const { type, value } = (
    group as ReturnType<typeof variableGroup>
  ).getRawValue();
  if (value === "") {
    return null;
  }
  switch (type) {
    case "number":
      return Number.isFinite(Number(value)) ? null : { valueType: true };
    case "boolean":
      return value === "true" || value === "false" ? null : { valueType: true };
    default:
      return null;
  }
}

export function variableGroup(
  fb: FormBuilder,
  {
    key = "",
    type = "string" as VariableType,
    value = null as Primitive | null,
    meta = {} as Partial<VariableMeta>,
  } = {},
) {
  const full: VariableMeta = {
    stored: false,
    fixed: false,
    readonly: false,
    ...meta,
  };
  const hidden = value === HIDDEN_STRING;
  return fb.group(
    {
      key: fb.control(key, [
        Validators.required,
        Validators.pattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
      ]),
      type: fb.control<VariableType>({ value: type, disabled: full.fixed }),
      // stored strings are never sent back: leave empty to keep them
      value: fb.control({
        value:
          value === null || value === undefined || hidden ? "" : String(value),
        disabled: full.readonly,
      }),
      meta: fb.control<VariableMeta>({
        ...full,
        stored: full.stored || hidden,
      }),
    },
    { validators: valueMatchesType },
  );
}

export type VariableGroup = ReturnType<typeof variableGroup>;

export function parseValue(type: VariableType, value: string): Primitive {
  switch (type) {
    case "number":
      return Number(value);
    case "boolean":
      return value === "true";
    default:
      return value;
  }
}
