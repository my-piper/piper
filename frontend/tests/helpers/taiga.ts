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
