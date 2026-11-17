import { Component, ChangeDetectionStrategy } from "@angular/core";
import { AppConfig } from "src/models/app-config";
import { UserRole } from "src/models/user";

@Component({
  selector: "app-main-toolbar",
  templateUrl: "./main-toolbar.component.html",
  styleUrls: ["./main-toolbar.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class MainToolbarComponent {
  userRole = UserRole;

  constructor(public appConfig: AppConfig) {}
}
