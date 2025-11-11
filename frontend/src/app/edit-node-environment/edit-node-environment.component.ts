import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import SCHEMAS from "src/schemas/compiled.json";
import { ProjectManager } from "src/services/project.manager";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-edit-node-environment",
  templateUrl: "./edit-node-environment.component.html",
  styleUrls: ["./edit-node-environment.component.scss"],
})
export class EditNodeEnvironmentComponent implements OnInit {
  schemas = SCHEMAS;

  project!: Project;
  id!: string;
  node!: Node;

  form = this.fb.group({
    environment: this.fb.control<object>(null),
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });
    this.form.valueChanges.subscribe(() => this.save());
  }

  private build() {
    const { environment } = toPlain(this.node);
    this.form.patchValue({ environment }, { emitEvent: false });
    this.cd.detectChanges();
  }

  private save() {
    const { environment } = plainToInstance(Node, this.form.getRawValue());
    assign(this.node, { environment });
    this.projectManager.markDirty();
  }
}
