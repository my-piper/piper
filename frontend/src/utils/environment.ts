import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { HIDDEN_STRING } from "src/consts/core";
import { Primitive } from "src/types/primitive";

/** What a Variable name may look like. */
export const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type VariableType = "string" | "number" | "boolean";

/** Where a Variable the Project doesn't set is read from. */
export type VariableSource = "user" | "platform" | "none";

/** What a row knows about its stored value. */
export interface VariableMeta {
  /** The value is stored server-side: an empty input keeps it. */
  stored: boolean;
  /** The stored value belongs to a Secret Variable, so it isn't shown. */
  storedSecret: boolean;
}

/** How each Variable type is named on screen. */
export const VARIABLE_TYPE_LABELS: Record<VariableType, string> = {
  string: $localize`:@@label.string:String`,
  number: $localize`:@@label.number:Number`,
  boolean: $localize`:@@label.boolean:Boolean`,
};

export const VARIABLE_TYPES = Object.keys(
  VARIABLE_TYPE_LABELS,
) as VariableType[];

const storedTexts = {
  kept: $localize`:@@message.stored_value_leave_empty:Stored, leave empty to keep`,
  dropped: $localize`:@@message.stored_secret_dropped_on_save:The stored value is dropped on save`,
};

/** What an editable row's empty value input says about its stored value. */
export function storedPlaceholder(
  { stored, storedSecret }: VariableMeta,
  type: string,
  secret: boolean,
) {
  if (type !== "string") {
    return "";
  }
  if (storedSecret && !secret) {
    return storedTexts.dropped;
  }
  return stored ? storedTexts.kept : "";
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
  const { type, value } = (group as VariableGroup).getRawValue();
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

/**
 * A row of an Environment form. `fixed` locks the type to a Node
 * declaration; `readonly` locks the value and the secret switch.
 */
export interface VariableOptions<M> {
  key?: string;
  type?: VariableType;
  value?: Primitive | null;
  secret?: boolean;
  fixed?: boolean;
  readonly?: boolean;
  meta?: M & Partial<VariableMeta>;
}

export function variableGroup<M extends object = object>(
  fb: FormBuilder,
  {
    key = "",
    type = "string",
    value = null,
    secret = true,
    fixed = false,
    readonly = false,
    meta = {} as M & Partial<VariableMeta>,
  }: VariableOptions<M> = {},
) {
  const storedSecret = value === HIDDEN_STRING;
  return fb.group(
    {
      key: fb.control(key, [
        Validators.required,
        Validators.pattern(VARIABLE_NAME),
      ]),
      type: fb.control<VariableType>({ value: type, disabled: fixed }),
      // only string Variables can be secret; off makes a Visible Variable
      secret: fb.nonNullable.control({
        value: secret,
        disabled: readonly,
      }),
      // stored strings are never sent back: leave empty to keep them
      value: fb.control({
        value:
          value === null || value === undefined || storedSecret
            ? ""
            : String(value),
        disabled: readonly,
      }),
      meta: fb.control<M & VariableMeta>({
        ...meta,
        stored: !!meta.stored || storedSecret,
        storedSecret,
      }),
    },
    { validators: valueMatchesType },
  );
}

export type VariableGroup<M extends object = object> = ReturnType<
  typeof variableGroup<M>
>;

export type VariableRow<M extends object = object> = ReturnType<
  VariableGroup<M>["getRawValue"]
>;

/**
 * No two rows of an Environment may share a name, and a row may not take a
 * name another row still has stored: that rename has to be saved first.
 */
export function uniqueNames(array: AbstractControl): ValidationErrors | null {
  const rows = (
    array as FormArray<VariableGroup<{ storedName?: string }>>
  ).getRawValue();
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
export function visibleNames(rows: VariableRow[]): string[] {
  return rows
    .filter(({ type, secret }) => type === "string" && !secret)
    .map(({ key }) => key);
}
