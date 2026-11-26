import {
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  ChangeDetectionStrategy,
} from "@angular/core";
import { LaunchRequest } from "src/models/launch-request";
import { PipelineInput } from "src/models/pipeline";
import { Project } from "src/models/project";
import { Primitive } from "src/types/primitive";
import { UI } from "src/consts/ui";

@Component({
  selector: "app-pipeline-input",
  templateUrl: "./pipeline-input.component.html",
  styleUrls: ["./pipeline-input.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
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

  /** Sized to its longest option instead of the 150px string cap. */
  @HostBinding("class.choices")
  get choices() {
    return this.input.enum?.length > 0;
  }

  @Output()
  output = new EventEmitter<string>();

  constructor(private hostRef: ElementRef) {}

  pin() {
    this.output.emit();
  }
}
