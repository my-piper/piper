/** What a number widget needs from its input (NodeInput). */
export type NumberSpec = {
  type: "integer" | "float" | string;
  step?: number | null;
  min?: number | null;
  max?: number | null;
};

function stepOf(spec: NumberSpec) {
  const step = spec.step && spec.step > 0 ? spec.step : 1;
  return spec.type === "integer" ? Math.max(1, Math.round(step)) : step;
}

/**
 * `value` held to `min`/`max`: whole for an integer, and for a float free of
 * binary noise (0.1 + 0.2 is 0.3), keeping what was typed.
 */
export function fitNumber(value: number, spec: NumberSpec): number {
  let fitted =
    spec.type === "integer" ? Math.round(value) : Number(value.toFixed(10));
  if (typeof spec.min === "number") {
    fitted = Math.max(spec.min, fitted);
  }
  if (typeof spec.max === "number") {
    fitted = Math.min(spec.max, fitted);
  }
  return fitted;
}

/** One ‹ or › press: `current` (empty counts as 0) moved by one step. */
export function stepNumber(
  current: number | null | undefined,
  direction: 1 | -1,
  spec: NumberSpec,
): number {
  const base = typeof current === "number" && !isNaN(current) ? current : 0;
  return fitNumber(base + direction * stepOf(spec), spec);
}

/**
 * Typed text as a value: null for an emptied field (the input falls back to
 * its default), undefined for text that is not a number (keep the old value).
 */
export function parseNumber(
  text: string,
  spec: NumberSpec,
): number | null | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return isNaN(value) ? undefined : fitNumber(value, spec);
}
