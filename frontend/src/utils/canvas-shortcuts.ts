export type CanvasShortcut = "delete" | "select-all" | "launch" | "help";

type Keys = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/**
 * The canvas shortcut a key press asks for, or null. Delete/Backspace removes
 * the selection, Ctrl/⌘ + A selects everything, Ctrl/⌘ + Enter launches and
 * `?` shows the shortcuts. Where the press lands is the caller's check.
 */
export function canvasShortcut(event: Keys): CanvasShortcut | null {
  const command = event.metaKey || event.ctrlKey;
  if (event.altKey) {
    return null;
  }
  if (command) {
    if (event.key === "Enter") {
      return "launch";
    }
    if (event.key.toLowerCase() === "a" && !event.shiftKey) {
      return "select-all";
    }
    return null;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    return "delete";
  }
  if (event.key === "?") {
    return "help";
  }
  return null;
}

/** Text fields and editors keep their own keys. */
export function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest("input, textarea, select, .monaco-editor"))
  );
}
