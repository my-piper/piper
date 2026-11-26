import { TestBed } from "@angular/core/testing";
import { TUI_ICON_REGISTRY, tuiIconsProvider } from "@taiga-ui/core";
import { PIPER_ICONS } from "src/icons";

/**
 * The names app-icon drew before #178. Pipelines name icons by these strings
 * (the `icon` of an input, backend/schemas/pipeline.json), so the set may
 * grow but none may be renamed or dropped. The brand logos are `@img.` so
 * Taiga draws them in their own colors.
 */
const APP_ICON_NAMES = [
  "3d_modeling",
  "add",
  "add-circle",
  "add-node",
  "admin",
  "agent",
  "app",
  "archive",
  "assistant",
  "audio",
  "checked",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "chevron-up",
  "close",
  "cloud",
  "code_generation",
  "copy",
  "cursor",
  "deep_swap",
  "delete",
  "dollar",
  "download",
  "drag",
  "edit",
  "error",
  "face",
  "face_swapping",
  "@img.google",
  "grid",
  "help",
  "image",
  "image_editing",
  "image_generation",
  "in",
  "info",
  "input",
  "json",
  "json_text",
  "language_translation",
  "lock",
  "logout",
  "magic",
  "menu",
  "minus",
  "more",
  "node",
  "number",
  "object_detection",
  "off",
  "on",
  "open-link",
  "out",
  "password",
  "play",
  "play-filled",
  "plus",
  "remove",
  "save",
  "select-image",
  "share",
  "speech_synthesis",
  "stop",
  "switcher",
  "text",
  "text_analysis",
  "text_generation",
  "theme",
  "unchecked",
  "upload",
  "user",
  "validate",
  "video",
  "video_generation",
  "@img.yandex",
];

describe("Piper icon set", () => {
  it("keeps every name app-icon had, plus the bold variants", () => {
    const names = Object.keys(PIPER_ICONS).sort();

    expect(names).toEqual(
      [...APP_ICON_NAMES, "more-bold", "open-link-bold"].sort(),
    );
  });

  it("holds standalone SVG documents", () => {
    for (const [name, svg] of Object.entries(PIPER_ICONS)) {
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");

      expect(doc.querySelector("parsererror"), name).toBeNull();
      expect(doc.documentElement.namespaceURI, name).toBe(
        "http://www.w3.org/2000/svg",
      );
      expect(doc.documentElement.getAttribute("viewBox"), name).toBeTruthy();
    }
  });

  it("draws mask icons in currentColor and bakes the stroke width", () => {
    const svg = (name: string) =>
      new DOMParser().parseFromString(PIPER_ICONS[name], "image/svg+xml")
        .documentElement;

    expect(svg("more").getAttribute("stroke")).toBe("currentColor");
    expect(svg("more").getAttribute("stroke-width")).toBe("1");
    expect(svg("more-bold").getAttribute("stroke-width")).toBe("2");
  });

  it("registers the set with Taiga as SVG data URLs", () => {
    TestBed.configureTestingModule({
      providers: [tuiIconsProvider(PIPER_ICONS)],
    });

    const registry = TestBed.inject(TUI_ICON_REGISTRY);

    expect(registry["theme"]).toMatch(/^"data:image\/svg\+xml;charset=UTF-8,/);
    expect(registry["@img.google"]).toMatch(/^"data:image\/svg\+xml/);
  });
});
