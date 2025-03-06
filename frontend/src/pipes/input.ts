import { Pipe, PipeTransform } from "@angular/core";
import { Node } from "src/models/node";
import { Pipeline, PipelineInput } from "src/models/pipeline";

@Pipe({ name: "pipelineInput" })
export class PipelineInputPipe implements PipeTransform {
  transform(pipeline: Pipeline, id: string): PipelineInput {
    const input = pipeline.inputs.get(id);
    if (!input) {
      throw new Error(`Input ${id} not found`);
    }
    return input;
  }
}
