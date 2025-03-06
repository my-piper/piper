import { Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { UserRole } from "src/models/user";

@Component({
  selector: "app-layout",
  templateUrl: "./layout.template.html",
  styleUrls: ["./layout.template.scss"],
})
export class AppLayoutComponent {
  userRole = UserRole;

  constructor(private route: ActivatedRoute) {}
}
