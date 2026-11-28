import { Pipeline } from "models/pipeline";

/**
 * The pipeline outputs a Launch waits for: those fed by at least one Flow.
 * Only a Flow from a Node writes a pipeline output, so an output without
 * Flows can never get a value and is left out instead of keeping the Launch
 * running forever.
 */
export function requiredOutputs(pipeline: Pipeline): string[] {
  return [...(pipeline.outputs?.entries() ?? [])]
    .filter(([, output]) => output.flows?.size > 0)
    .map(([key]) => key);
}

/**
 * Whether a Launch of this pipeline can ever finish: it needs at least one
 * output that a Flow can fill.
 */
export function canFinish(pipeline: Pipeline): boolean {
  return requiredOutputs(pipeline).length > 0;
}

/**
 * A Launch is finished when every required pipeline output has a value,
 * counted once per output however many Flows feed it.
 */
export function isFinished(
  pipeline: Pipeline,
  filled: { has(output: string): boolean }
): boolean {
  const required = requiredOutputs(pipeline);
  return required.length > 0 && required.every((key) => filled.has(key));
}
