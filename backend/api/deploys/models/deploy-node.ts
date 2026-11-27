import { Expose, Transform, Type } from "core-kit/packages/transform";
import { objectsMapTransformer } from "transformers/map";
import assign from "lodash/assign";
import { NodeInput, NodeOutput } from "models/node";

/** A Deploy as the editor offers it for a Node that runs it. */
export class DeployNode {
  @Expose()
  @Type(() => String)
  prefix?: string;

  @Expose()
  @Type(() => String)
  slug!: string;

  /** The title of the Project the Deploy was made from. */
  @Expose()
  @Type(() => String)
  title!: string;

  @Expose()
  @Type(() => Date)
  deployedAt!: Date;

  /** Sent only for a single Deploy, not in the list. */
  @Expose()
  @Transform(objectsMapTransformer(NodeInput))
  inputs?: Map<string, NodeInput>;

  @Expose()
  @Transform(objectsMapTransformer(NodeOutput))
  outputs?: Map<string, NodeOutput>;

  constructor(defs: Partial<DeployNode> = {}) {
    assign(this, defs);
  }
}
