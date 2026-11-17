import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { PipelineOutput } from "src/models/pipeline";

@Component({
  selector: "app-pipeline-output",
  templateUrl: "./pipeline-output.component.html",
  styleUrls: ["./pipeline-output.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PipelineOutputComponent {
  @Input()
  id!: string;

  @Input()
  output!: PipelineOutput;
}
