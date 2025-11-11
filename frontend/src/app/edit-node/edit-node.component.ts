import { Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { UI } from "src/consts/ui";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";

@Component({
  selector: "app-edit-node",
  templateUrl: "./edit-node.component.html",
  styleUrls: ["./edit-node.component.scss"],
})
export class EditNodeComponent {
  userRole = UserRole;
  ui = UI;
  project!: Project;
  id!: string;
  node!: Node;

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
    });
  }
}
