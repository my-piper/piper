import { ChatCompletionMessage } from "app/llm";
import {
  arrayTransformer,
  Expose,
  objectTransformer,
  Transform,
  Type,
} from "core-kit/packages/transform";

export class AssistantRequest {
  @Expose()
  @Type(() => String)
  activeNode!: string;

  @Expose()
  @Type(() => String)
  question!: string;
}

export class Catalog {
  @Expose()
  @Type(() => String)
  id!: string;
}

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
  action!:
    | "add_node_from_catalog"
    | "add_node"
    | "remove_node"
    | "replace_node"
    | "add_flow";

  @Expose()
  @Type(() => Catalog)
  catalog!: Catalog;

  @Expose()
  @Type(() => ChangeData)
  data!: ChangeData;
}

export class PipelineChanges {
  @Expose()
  @Type(() => PipelineChange)
  changes!: PipelineChange[];
}

export class ChatMessage {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => String)
  project!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => String)
  from!: string | "assistant";

  @Expose()
  @Type(() => String)
  message!: string;

  @Expose()
  @Type(() => PipelineChange)
  changes!: PipelineChange[];

  @Expose()
  @Transform(arrayTransformer<Object>())
  completions!: ChatCompletionMessage[];
}

export class AssistantMessage {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => String)
  project!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Transform(objectTransformer)
  data!: object;
}
