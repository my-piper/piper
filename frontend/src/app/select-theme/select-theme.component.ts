import { Component, ChangeDetectionStrategy, HostBinding } from "@angular/core";
import { ThemeManager, ThemeMode } from "src/services/theme.service";

@Component({
  selector: "app-select-theme",
  templateUrl: "./select-theme.component.html",
  styleUrls: ["./select-theme.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SelectThemeComponent {
  modes: ThemeMode[] = ["light", "dark", "system"];

  constructor(public themes: ThemeManager) {}

  /**
   * Taiga colors follow the app's theme here too: the header's menu opens in
   * a dropdown that inherits the navigation header's dark theme.
   */
  @HostBinding("attr.tuiTheme")
  get tuiTheme() {
    return this.themes.theme;
  }
}
