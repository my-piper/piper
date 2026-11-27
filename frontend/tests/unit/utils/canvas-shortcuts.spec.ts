import { canvasShortcut, isEditable } from "src/utils/canvas-shortcuts";

function press(key: string, modifiers: Partial<KeyboardEvent> = {}) {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

describe("canvasShortcut", () => {
  it("deletes the selection with Delete and Backspace", () => {
    const keys = [press("Delete"), press("Backspace")];

    const shortcuts = keys.map(canvasShortcut);

    expect(shortcuts).toEqual(["delete", "delete"]);
  });

  it("selects all and launches with Ctrl or Cmd", () => {
    const keys = [
      press("a", { ctrlKey: true }),
      press("A", { metaKey: true }),
      press("Enter", { metaKey: true }),
      press("Enter", { ctrlKey: true }),
    ];

    const shortcuts = keys.map(canvasShortcut);

    expect(shortcuts).toEqual(["select-all", "select-all", "launch", "launch"]);
  });

  it("duplicates with Ctrl or Cmd + D, not with Shift", () => {
    const keys = [
      press("d", { ctrlKey: true }),
      press("D", { metaKey: true }),
      press("d", { ctrlKey: true, shiftKey: true }),
      press("c", { ctrlKey: true }),
    ];

    const shortcuts = keys.map(canvasShortcut);

    expect(shortcuts).toEqual(["duplicate", "duplicate", null, null]);
  });

  it("groups with Ctrl or Cmd + G, not with Shift", () => {
    const keys = [
      press("g", { ctrlKey: true }),
      press("G", { metaKey: true }),
      press("g", { ctrlKey: true, shiftKey: true }),
    ];

    const shortcuts = keys.map(canvasShortcut);

    expect(shortcuts).toEqual(["group", "group", null]);
  });

  it("shows the shortcuts with ?", () => {
    const key = press("?", { shiftKey: true });

    const shortcut = canvasShortcut(key);

    expect(shortcut).toBe("help");
  });

  it("ignores plain letters, Enter and Alt combinations", () => {
    const keys = [
      press("a"),
      press("Enter"),
      press("a", { ctrlKey: true, altKey: true }),
      press("Delete", { altKey: true }),
    ];

    const shortcuts = keys.map(canvasShortcut);

    expect(shortcuts).toEqual([null, null, null, null]);
  });
});

describe("isEditable", () => {
  it("treats fields and content-editable elements as editable", () => {
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.append(input, editable);

    const results = [input, editable, document.body].map(isEditable);

    expect(results).toEqual([true, true, false]);
    input.remove();
    editable.remove();
  });
});
