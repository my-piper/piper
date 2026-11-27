import { Expose, Type } from "class-transformer";
import { NodeInput, NodeOutput } from "./node";

/**
 * A Deploy as the editor offers it for a Run Deploy node: listed by
 * `GET /api/me/deploys`, with its sockets from
 * `GET /api/deploys/[:prefix/]:slug/sockets`.
 */
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

  @Expose()
  @Type(() => NodeInput)
  inputs?: Map<string, NodeInput>;

  @Expose()
  @Type(() => NodeOutput)
  outputs?: Map<string, NodeOutput>;
}
