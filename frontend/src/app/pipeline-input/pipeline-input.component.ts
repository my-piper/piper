import { Component, ElementRef, HostBinding, Input } from "@angular/core";
import { LaunchRequest } from "src/models/launch-request";
import { PipelineInput } from "src/models/pipeline";
import { Project } from "src/models/project";
import { Primitive } from "src/types/primitive";
import { UI } from "src/ui-kit/consts";

@Component({
  selector: "app-pipeline-input",
  templateUrl: "./pipeline-input.component.html",
  styleUrls: ["./pipeline-input.component.scss"],
})
export class PipelineInputComponent {
  ui = UI;

  @Input()
  id!: string;

  @Input()
  input!: PipelineInput;

  @Input()
  value!: Primitive;

  @Input()
  project!: Project;

  @Input()
  launchRequest!: LaunchRequest;

  @HostBinding("attr.data-type")
  get type() {
    return this.input.type;
  }

  @HostBinding("class.multiline")
  get multiline() {
    return this.input.multiline;
  }

  constructor(private hostRef: ElementRef) {}
}
