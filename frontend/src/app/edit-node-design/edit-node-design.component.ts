import { Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import SCHEMAS from "src/schemas/compiled.json";
import { ProjectManager } from "src/services/project.manager";
import { assign, essential } from "src/utils/assign";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-edit-node-design",
  templateUrl: "./edit-node-design.component.html",
  styleUrls: ["./edit-node-design.component.scss"],
})
export class EditNodeDesignComponent implements OnInit {
  schemas = (() => {
    const {
      _id,
      title,
      version,
      description,
      thumbnail,
      tags,
      icon,
      order,
      inputs,
      outputs,
    } = SCHEMAS.node.properties;
    return {
      node: {
        ...SCHEMAS.node,
        properties: {
          _id,
          title,
          version,
          description,
          thumbnail,
          tags,
          icon,
          order,
        },
        required: ["title", "version"],
      },
      inputs,
      outputs,
    };
  })();

  project!: Project;
  id!: string;
  node!: Node;

  form = this.fb.group({
    node: this.fb.control<object>(null),
    inputs: this.fb.control<object>(null),
    outputs: this.fb.control<object>(null),
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
    const {
      _id,
      title,
      version,
      description,
      thumbnail,
      tags,
      icon,
      order,
      inputs,
      outputs,
    } = toPlain(this.node);
    this.form.patchValue({
      node: essential({
        _id,
        title,
        version,
        description,
        thumbnail,
        tags,
        icon,
        order,
      }),
      inputs,
      outputs,
    });
  }

  private save() {
    const {
      _id,
      title,
      version,
      description,
      thumbnail,
      tags,
      icon,
      order,
      inputs,
      outputs,
    } = plainToInstance(
      Node,
      (() => {
        const { node, inputs, outputs } = this.form.getRawValue();
        return { ...node, inputs, outputs };
      })()
    );
    assign(this.node, {
      _id,
      title,
      version,
      description,
      thumbnail,
      tags,
      icon,
      order,
      inputs,
      outputs,
    });
    this.node.build();
    this.projectManager.markDirty();
  }
}
