import {
  Expose,
  objectTransformer,
  Transform,
  Type,
} from "core-kit/packages/transform";

export class ChangeData {
  @Expose()
  @Type(() => String)
  id!: string;

  @Expose()
  @Transform(objectTransformer)
  json!: object;
}

export class PipelineChange {
  @Expose()
  @Type(() => String)
  action!: "add_node" | "remove_node" | "replace_node" | "add_flow";

  @Expose()
  @Type(() => ChangeData)
  data!: ChangeData;
}

export class ChatMessage {
  @Expose()
  @Type(() => String)
  from!: "user" | "assistant";

  @Expose()
  @Type(() => String)
  message!: string;

  @Expose()
  @Type(() => PipelineChange)
  changes!: PipelineChange[];
}
