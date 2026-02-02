import { Component, Input, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { assign } from "lodash";
import { LaunchRequest } from "src/models/launch-request";
import { NodeInput } from "src/models/node";
import { NodeFlow } from "src/models/node-flow";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";

@Component({
  selector: "app-edit-flow-transformer",
  templateUrl: "./edit-flow-transformer.component.html",
  styleUrls: ["./edit-flow-transformer.component.scss"],
})
export class EditFlowTransformerComponent implements OnInit {
  _flow!: NodeFlow;

  instances = { popover: null as any };

  @Input()
  project!: Project;

  @Input()
  launchRequest!: LaunchRequest;

  @Input()
  id!: string;

  @Input()
  set flow(flow: NodeFlow) {
    this._flow = flow;
    this.build();
  }

  get flow() {
    return this._flow;
  }

  @Input()
  from!: { id: string; node: NodeInput };

  @Input()
  to!: { id: string; node: NodeInput };

  indexControl = this.fb.control<number>(0);
  pathControl = this.fb.control<string>(null);
  form = this.fb.group({
    index: this.indexControl,
    path: this.pathControl,
  });

  constructor(
    private fb: FormBuilder,
    private projectManager: ProjectManager,
  ) {}

  ngOnInit() {
    this.form.valueChanges.subscribe(() => this.save());
  }

  build() {
    const {
      transformer: { index, path },
    } = this.flow;
    this.form.patchValue({ index, path }, { emitEvent: false });
  }

  down() {
    const index = this.indexControl.value;
    if (index <= 0) {
      return;
    }
    this.indexControl.setValue(index - 1);
  }

  up() {
    const index = this.indexControl.value;
    const value = this.launchRequest.nodes
      .get(this.from.id)
      ?.outputs.get(this.flow.output) as string;
    if (!!value) {
      const array = value.split("|");
      if (index >= array.length - 1) {
        return;
      }
      this.indexControl.setValue(index + 1);
    }
  }

  setPath(path: string) {
    this.pathControl.setValue(path);
    this.instances.popover?.hide();
  }

  save() {
    const { index, path } = this.form.getRawValue();
    assign(this.flow.transformer, { index, path });

    this.projectManager.markDirty();
  }
}
