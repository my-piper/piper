import { Component } from "@angular/core";
import { AppConfig } from "src/models/app-config";

@Component({
  selector: "app-layout",
  templateUrl: "./layout.template.html",
  styleUrls: ["./layout.template.scss"],
})
export class AppLayoutComponent {
  constructor(public appConfig: AppConfig) {}
}
