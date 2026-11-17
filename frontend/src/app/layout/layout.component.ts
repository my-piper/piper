import { Component, ChangeDetectionStrategy } from "@angular/core";
import { AppConfig } from "src/models/app-config";

@Component({
  selector: "app-layout",
  templateUrl: "./layout.template.html",
  styleUrls: ["./layout.template.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AppLayoutComponent {
  constructor(public appConfig: AppConfig) {}
}
