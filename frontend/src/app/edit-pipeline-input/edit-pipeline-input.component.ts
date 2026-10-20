import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { debounceTime } from "rxjs";
import { LaunchRequest } from "src/models/launch-request";
import { PipelineInput } from "src/models/pipeline";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { Primitive } from "src/types/primitive";

@Component({
  selector: "app-edit-pipeline-input",
  templateUrl: "./edit-pipeline-input.component.html",
  styleUrls: ["./edit-pipeline-input.component.scss"],
})
export class EditPipelineInputComponent implements OnInit {
  @Input()
  id!: string;

  @Input()
  input!: PipelineInput;

  @Input()
  project!: Project;

  @Input()
  launchRequest!: LaunchRequest;

  valueControl = this.fb.control<Primitive | null>(null);
  form = this.fb.group({
    value: this.valueControl,
  });

  @Output()
  saved = new EventEmitter<LaunchRequest>();

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.build();

    this.valueControl.valueChanges
      .pipe(debounceTime(500))
      .subscribe(() => this.save());
  }

  private build() {
    const stored = this.launchRequest.inputs?.get(this.id);
    const value = stored !== undefined ? stored : this.input.default;
    this.form.patchValue({ value });
  }

  private async save() {
    const { inputs } = this.launchRequest;

    const { value } = this.form.getRawValue();
    if (value !== null) {
      switch (this.input.type) {
        case "boolean":
          const val = !!value;
          if (val !== this.input.default) {
            inputs.set(this.id, val);
          } else {
            inputs.delete(this.id);
          }

          break;
        case "integer":
        case "float":
        case "string":
        case "string[]":
        case "json":
        case "image":
          // Keep explicit 0 / "" when they differ from the default; an empty
          // string only means "no value" when there is no default to override.
          const hasDefault =
            this.input.default !== undefined && this.input.default !== null;
          if (value !== this.input.default && (value !== "" || hasDefault)) {
            inputs.set(this.id, value);
          } else {
            inputs.delete(this.id);
          }
          break;
        default:
          inputs.set(this.id, value);
      }
    } else {
      this.launchRequest.inputs.delete(this.id);
    }

    this.projectManager.markDirty();
    this.saved.emit(this.launchRequest);
  }
}
