import { TestBed } from "@angular/core/testing";
import { THEME_KEY } from "src/consts/core";
import { applyMonacoTheme, ThemeManager } from "src/services/theme.service";

type SchemeListener = () => void;

function stubColorScheme(light: boolean) {
  const listeners: SchemeListener[] = [];
  const media = {
    matches: light,
    addEventListener: (_: string, listener: SchemeListener) =>
      listeners.push(listener),
  };
  spyOn(window, "matchMedia").and.returnValue(
    media as unknown as MediaQueryList
  );
  return {
    change: (next: boolean) => {
      media.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function documentTheme() {
  return document.documentElement.dataset["theme"];
}

describe("ThemeManager", () => {
  let initialTheme: string | undefined;

  beforeEach(() => {
    initialTheme = documentTheme();
  });

  afterEach(() => {
    document.documentElement.dataset["theme"] = initialTheme;
  });

  it("follows the system color scheme by default", () => {
    stubColorScheme(true);

    const themes = TestBed.inject(ThemeManager);

    expect(themes.mode).toBe("system");
    expect(themes.theme).toBe("light");
    expect(documentTheme()).toBe("light");
  });

  it("prefers a stored mode over the system color scheme", () => {
    stubColorScheme(true);
    localStorage.setItem(THEME_KEY, "dark");

    const themes = TestBed.inject(ThemeManager);

    expect(themes.mode).toBe("dark");
    expect(documentTheme()).toBe("dark");
  });

  it("ignores an unknown stored mode", () => {
    stubColorScheme(false);
    localStorage.setItem(THEME_KEY, "sepia");

    const themes = TestBed.inject(ThemeManager);

    expect(themes.mode).toBe("system");
    expect(documentTheme()).toBe("dark");
  });

  it("persists and applies a selected mode", () => {
    stubColorScheme(false);
    const themes = TestBed.inject(ThemeManager);

    themes.setMode("light");

    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(themes.theme$.getValue()).toBe("light");
    expect(documentTheme()).toBe("light");
  });

  it("tracks system changes only in system mode", () => {
    const scheme = stubColorScheme(false);
    const themes = TestBed.inject(ThemeManager);

    scheme.change(true);
    const followed = documentTheme();
    themes.setMode("dark");
    scheme.change(false);
    scheme.change(true);

    expect(followed).toBe("light");
    expect(documentTheme()).toBe("dark");
  });
});

describe("applyMonacoTheme", () => {
  let initialTheme: string | undefined;
  const global = window as unknown as { monaco?: unknown };

  beforeEach(() => {
    initialTheme = documentTheme();
  });

  afterEach(() => {
    document.documentElement.dataset["theme"] = initialTheme;
    delete global.monaco;
  });

  it("maps the document theme to the Monaco theme", () => {
    const setTheme = jasmine.createSpy("setTheme");
    global.monaco = { editor: { setTheme } };
    document.documentElement.dataset["theme"] = "light";

    applyMonacoTheme();
    document.documentElement.dataset["theme"] = "dark";
    applyMonacoTheme();

    expect(setTheme.calls.allArgs()).toEqual([["vs"], ["vs-dark"]]);
  });

  it("does nothing before Monaco is loaded", () => {
    document.documentElement.dataset["theme"] = "light";

    expect(() => applyMonacoTheme()).not.toThrow();
  });
});
