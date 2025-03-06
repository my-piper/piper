import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Project } from "src/models/project";

@Component({
  selector: "pipeline-readme",
  templateUrl: "./pipeline-readme.component.html",
  styleUrls: ["./pipeline-readme.component.scss"],
})
export class PipelineReadmeComponent implements OnInit {
  project!: Project;

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => (this.project = project));
  }
}
