import { Component, Input, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { NodeStateComponent } from "src/app/node-state/node-state.component";
import { UI } from "src/consts/ui";
import { Launch } from "src/models/launch";
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";

@Component({
  selector: "app-launch",
  templateUrl: "./launch.component.html",
  styleUrls: ["./launch.component.scss"],
})
export class LaunchComponent implements OnInit {
  ui = UI;
  hostname = document.location.hostname;

  project!: Project;
  pipeline!: Pipeline;
  modal!: NodeStateComponent;

  @Input()
  launch!: Launch;

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ launch, project }) => {
      [this.launch, this.pipeline, this.project] = [
        launch,
        launch.pipeline,
        project,
      ];
    });
  }

  nodeState(node: string) {
    this.router.navigate(["nodes", node], { relativeTo: this.route });
  }
}
