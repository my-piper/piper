import { expectConsoleError } from "./console";

/**
 * Declares the NG0303 Angular logs for Taiga's native select
 * (`select[tuiSelect]`): its input directive binds `readOnly`, which <select>
 * doesn't have. TestBed checks DOM properties because its module has schemas;
 * the app's modules have none, so the app never logs it. Pair with
 * `errorOnUnknownProperties: false`, which logs instead of throwing.
 */
export function expectNativeSelectReadOnly() {
  expectConsoleError(
    "Can't bind to 'readOnly' since it isn't a known property of 'select'",
  );
}

/** The label of the option a native select shows. */
export function selectedLabel(select: Element | null): string {
  const { options, selectedIndex } = select as HTMLSelectElement;
  return options[selectedIndex]?.textContent.trim() ?? "";
}

/** The labels of a native select's options. */
export function optionLabels(select: Element | null): string[] {
  return Array.from((select as HTMLSelectElement).options).map((option) =>
    option.textContent.trim(),
  );
}

/** Picks an option of a native select by its label, as a user would. */
export function selectByLabel(select: Element | null, label: string) {
  const element = select as HTMLSelectElement;
  element.selectedIndex = optionLabels(element).indexOf(label);
  element.dispatchEvent(new Event("change"));
}

/**
 * The labels of a chip input's chips. Reads Taiga's label element, since a
 * chip's own text also holds its hidden, localized "Remove" button.
 */
export function chipLabels(textfield: Element | null): string[] {
  return Array.from(
    (textfield as Element).querySelectorAll("tui-input-chip .t-text"),
  ).map((label) => label.textContent.trim());
}

/**
 * Adds a chip as a user would: `input[tuiInputChip]` only reads typing while
 * focused, and Enter turns the text into a chip. The focused input leaves
 * Taiga timers running, so destroy the fixture before `finish()`.
 */
export function typeChip(input: Element | null, text: string) {
  const element = input as HTMLInputElement;
  element.focus();
  element.value = text;
  element.dispatchEvent(new Event("input"));
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
}

/**
 * Whether a `tui-textfield` shows its input as invalid: Taiga draws the red
 * border from the textfield's `data-mode`, set by its `[invalid]` binding.
 */
export function markedInvalid(input: Element | null): boolean {
  return !!(input as Element).closest('tui-textfield[data-mode~="invalid"]');
}

/** The message a `<tui-error>` shows; empty while the field has none. */
export function fieldError(error: Element | null): string {
  return (error as Element).textContent.trim();
}

/** Shows or hides a password field's value by clicking its eye icon. */
export function togglePassword(textfield: Element | null) {
  (textfield as Element)
    .querySelector<HTMLElement>("tui-icon[tuiPassword]")
    .click();
}

/** The labels of a `<tui-segmented>`'s items. */
export function segmentLabels(segmented: Element | null): string[] {
  return Array.from((segmented as Element).children).map((item) =>
    item.textContent.trim(),
  );
}

/** The label of the item a `<tui-segmented>` marks active. */
export function activeSegment(segmented: Element | null): string {
  return (
    (segmented as Element)
      .querySelector(":scope > .tui-segmented_active")
      ?.textContent.trim() ?? ""
  );
}

/**
 * Picks a `<tui-segmented>` item by its label, as a user would: clicks the
 * radio inside a label item, or the item itself when it is a button or link.
 */
export function pickSegment(segmented: Element | null, label: string) {
  const item = Array.from((segmented as Element).children).find(
    (child) => child.textContent.trim() === label,
  ) as HTMLElement;
  (item.querySelector<HTMLElement>("input") ?? item).click();
}
