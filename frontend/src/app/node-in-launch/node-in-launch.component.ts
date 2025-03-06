import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Launch } from "src/models/launch";
import { Node } from "src/models/node";

@Component({
  selector: "app-node-in-launch",
  templateUrl: "./node-in-launch.component.html",
  styleUrls: ["./node-in-launch.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeInLaunchComponent implements OnInit {
  launch: Launch;
  id!: string;
  node!: Node;

  constructor(
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, launch, node: { id, node } }) => {
      [this.launch, this.id, this.node] = [launch, id, node];
      this.cd.detectChanges();
    });
  }
}
