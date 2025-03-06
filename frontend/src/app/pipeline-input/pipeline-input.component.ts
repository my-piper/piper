import { Component, Input } from "@angular/core";
import { PipelineInput } from "src/models/pipeline";
import { Primitive } from "src/types/primitive";

@Component({
  selector: "app-pipeline-input",
  templateUrl: "./pipeline-input.component.html",
  styleUrls: ["./pipeline-input.component.scss"],
})
export class PipelineInputComponent {
  @Input()
  id!: string;

  @Input()
  input!: PipelineInput;

  @Input()
  value!: Primitive;
}
