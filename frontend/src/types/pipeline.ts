export type PipelineEventType =
  | "node_running"
  | "node_done"
  | "node_error"
  | "node_flow";

export type PipelineIOType =
  | "boolean"
  | "integer"
  | "float"
  | "string"
  | "string[]"
  | "json"
  | "image"
  | "image[]"
  | "archive"
  | "audio"
  | "video"
  | "video[]";
