import { Component } from "@angular/core";
import { AppConfig } from "src/models/app-config";
import { UserRole } from "src/models/user";

@Component({
  selector: "app-layout",
  templateUrl: "./layout.template.html",
  styleUrls: ["./layout.template.scss"],
})
export class AppLayoutComponent {
  userRole = UserRole;

  constructor(public appConfig: AppConfig) {}
}
