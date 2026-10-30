import { DOCUMENT } from "@angular/common";
import { Inject, Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { THEME_KEY } from "src/consts/core";

export type ThemeMode = "dark" | "light" | "system";
export type Theme = "dark" | "light";

const THEME_MODES: ThemeMode[] = ["dark", "light", "system"];
const LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

type MonacoGlobal = { monaco?: { editor: { setTheme(theme: string): void } } };

export function monacoTheme(theme: Theme): string {
  return theme === "light" ? "vs" : "vs-dark";
}

// Editors are created without a theme option, so the global Monaco theme
// follows the document theme set before bootstrap (see index.html).
export function applyMonacoTheme(doc: Document = document) {
  const theme = doc.documentElement.dataset["theme"] === "light" ? "light" : "dark";
  (doc.defaultView as MonacoGlobal | null)?.monaco?.editor.setTheme(
    monacoTheme(theme)
  );
}

@Injectable({ providedIn: "root" })
export class ThemeManager {
  mode$ = new BehaviorSubject<ThemeMode>(this.readMode());
  theme$ = new BehaviorSubject<Theme>(this.resolve(this.mode$.getValue()));

  private media: MediaQueryList;

  get mode() {
    return this.mode$.getValue();
  }

  get theme() {
    return this.theme$.getValue();
  }

  constructor(@Inject(DOCUMENT) private document: Document) {
    this.media = this.document.defaultView.matchMedia(LIGHT_SCHEME_QUERY);
    this.media.addEventListener("change", () => this.apply());
    this.apply();
  }

  setMode(mode: ThemeMode) {
    localStorage.setItem(THEME_KEY, mode);
    this.mode$.next(mode);
    this.apply();
  }

  private readMode(): ThemeMode {
    const mode = localStorage.getItem(THEME_KEY) as ThemeMode;
    return THEME_MODES.includes(mode) ? mode : "system";
  }

  private resolve(mode: ThemeMode): Theme {
    if (mode !== "system") {
      return mode;
    }
    return this.document.defaultView.matchMedia(LIGHT_SCHEME_QUERY).matches
      ? "light"
      : "dark";
  }

  private apply() {
    const theme = this.resolve(this.mode);
    this.document.documentElement.dataset["theme"] = theme;
    if (theme !== this.theme) {
      this.theme$.next(theme);
    }
    applyMonacoTheme(this.document);
  }
}
