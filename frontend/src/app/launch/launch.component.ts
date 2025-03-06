import { Component, OnDestroy, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Socket } from "ngx-socket-io";
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
export class LaunchComponent implements OnInit, OnDestroy {
  ui = UI;
  hostname = document.location.hostname;

  _launch!: Launch;

  project!: Project;
  pipeline!: Pipeline;
  modal!: NodeStateComponent;

  set launch(launch: Launch) {
    this._launch = launch;
    this.socket.emit("join_room", launch._id);
  }

  get launch() {
    return this._launch;
  }

  constructor(
    private socket: Socket,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, launch }) => {
      [this.project, this.launch, this.pipeline] = [
        project,
        launch,
        launch.pipeline,
      ];
    });
  }

  ngOnDestroy(): void {
    this.socket.emit("leave_room", this.launch._id);
  }

  nodeState(node: string) {
    this.router.navigate(["nodes", node], { relativeTo: this.route });
  }
}
