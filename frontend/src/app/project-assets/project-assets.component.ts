import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Project } from "src/models/project";

@Component({
  selector: "app-project-assets",
  templateUrl: "./project-assets.component.html",
  styleUrls: ["./project-assets.component.scss"],
})
export class ProjectAssetsComponent implements OnInit {
  project!: Project;

  constructor(
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => (this.project = project));
  }
}
