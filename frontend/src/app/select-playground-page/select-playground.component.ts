import { Component } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Project } from "src/models/project";

@Component({
  selector: "app-select-playground-page",
  templateUrl: "./select-playground.component.html",
  styleUrls: ["./select-playground.component.scss"],
})
export class SelectPlaygroundPageComponent {
  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  go(project: Project) {
    this.router.navigate([project.slug || project._id], {
      relativeTo: this.route,
      state: { scroll: "top" },
    });
  }
}
