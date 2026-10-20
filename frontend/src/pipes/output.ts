import { Pipe, PipeTransform } from "@angular/core";
import { Pipeline, PipelineOutput } from "src/models/pipeline";

@Pipe({ name: "pipelineOutput" })
export class PipelineOutputPipe implements PipeTransform {
  transform(pipeline: Pipeline, id: string): PipelineOutput {
    const output = pipeline.outputs.get(id);
    if (!output) {
      throw new Error(`Output ${id} not found`);
    }
    return output;
  }
}
