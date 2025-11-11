import { Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { toPlain } from "src/utils/models";
import * as YAML from "yaml";

@Component({
  selector: "app-edit-node-yaml",
  templateUrl: "./edit-node-yaml.component.html",
  styleUrls: ["./edit-node-yaml.component.scss"],
})
export class EditNodeYamlComponent implements OnInit {
  project!: Project;
  id!: string;
  node!: Node;

  form = this.fb.group({
    node: this.fb.control<string>(null),
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });
    this.form.valueChanges.subscribe(() => this.save());
  }

  private build() {
    const node = YAML.stringify(toPlain(this.node), {
      lineWidth: 0,
    });
    this.form.patchValue({ node }, { emitEvent: false });
  }

  private save() {
    const { pipeline } = this.project;
    const { node: yaml } = this.form.getRawValue();
    const node = plainToInstance(Node, YAML.parse(<string>yaml));
    assign(this.node, node);
    this.projectManager.markDirty();
  }
}
