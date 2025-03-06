export type PipelineEventType =
  | "node_running"
  | "node_done"
  | "node_progress"
  | "node_error"
  | "node_flow"
  | "node_reset"
  | "node_gonna_repeat"
  | "set_pipeline_output";

export type PipelineIOType =
  | "boolean"
  | "integer"
  | "float"
  | "string"
  | "string[]"
  | "json"
  | "image"
  | "image[]"
  | "video"
  | "video[]";
