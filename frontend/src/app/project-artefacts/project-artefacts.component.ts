import { Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Project } from "src/models/project";

@Component({
  selector: "app-project-artefacts",
  templateUrl: "./project-artefacts.component.html",
  styleUrls: ["./project-artefacts.component.scss"],
})
export class ProjectArtefactsComponent {
  project!: Project;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.data.subscribe(({ project }) => (this.project = project));
  }
}
