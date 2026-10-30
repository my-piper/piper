import { Component } from "@angular/core";
import { ThemeManager, ThemeMode } from "src/services/theme.service";

@Component({
  selector: "app-select-theme",
  templateUrl: "./select-theme.component.html",
  styleUrls: ["./select-theme.component.scss"],
})
export class SelectThemeComponent {
  modes: ThemeMode[] = ["light", "dark", "system"];

  constructor(public themes: ThemeManager) {}
}
