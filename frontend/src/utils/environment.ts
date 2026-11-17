import {
  AbstractControl,
  FormArray,
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
  /** The stored value belongs to a Secret Variable, so it isn't shown. */
  storedSecret: boolean;
  /** The name the value is stored under, when the row can be renamed. */
  storedName?: string;
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
    secret = true,
    meta = {} as Partial<VariableMeta>,
  } = {},
) {
  const full: VariableMeta = {
    stored: false,
    storedSecret: false,
    fixed: false,
    readonly: false,
    ...meta,
  };
  const storedSecret = value === HIDDEN_STRING;
  return fb.group(
    {
      key: fb.control(key, [
        Validators.required,
        Validators.pattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
      ]),
      type: fb.control<VariableType>({ value: type, disabled: full.fixed }),
      // only string Variables can be secret; off makes a Visible Variable
      secret: fb.nonNullable.control({
        value: secret,
        disabled: full.readonly,
      }),
      // stored strings are never sent back: leave empty to keep them
      value: fb.control({
        value:
          value === null || value === undefined || storedSecret
            ? ""
            : String(value),
        disabled: full.readonly,
      }),
      meta: fb.control<VariableMeta>({
        ...full,
        stored: full.stored || storedSecret,
        storedSecret,
      }),
    },
    { validators: valueMatchesType },
  );
}

export type VariableGroup = ReturnType<typeof variableGroup>;

/**
 * No two rows of an Environment may share a name, and a row may not take a
 * name another row still has stored: that rename has to be saved first.
 */
export function uniqueNames(array: AbstractControl): ValidationErrors | null {
  const rows = (array as FormArray<VariableGroup>).getRawValue();
  const taken = rows.some(({ key }, i) =>
    rows.some(
      (other, j) =>
        i !== j && (other.key === key || other.meta.storedName === key),
    ),
  );
  return taken ? { duplicateName: true } : null;
}

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

/** Names of the rows saved as Visible Variables. */
export function visibleNames(
  rows: ReturnType<VariableGroup["getRawValue"]>[],
): string[] {
  return rows
    .filter(({ type, secret }) => type === "string" && !secret)
    .map(({ key }) => key);
}
