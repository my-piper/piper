import { UNIT_COST } from "consts/billing";
import { Expose, Transform, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { Arrange } from "models/arrange";
import { InputFlow } from "models/input-flow";
import { NodeFlow } from "models/node-flow";
import { objectsMapTransformer } from "transformers/map";
import {
  primitiveArrayTransformer,
  primitiveTransformer,
} from "transformers/primitive";
import { PipelineIOType } from "types/pipeline";
import { Primitive } from "types/primitive";
import { DeployConfig } from "./deploy-config";
import { Extension } from "./extension";
import { Node } from "./node";
import { OutputFlow } from "./output-flow";
import { PipelineCategory } from "./pipeline-category";

export class Start {
  @Expose()
  @Type(() => String)
  nodes: string[];
}

export class PipelineInput {
  @Expose()
  @Type(() => Number)
  order!: number;

  @Expose()
  @Type(() => String)
  title!: string;

  @Expose()
  @Type(() => String)
  description!: string;

  @Expose()
  @Type(() => String)
  type!: PipelineIOType;

  @Expose()
  @Type(() => Boolean)
  required!: boolean;

  @Expose()
  @Type(() => Boolean)
  multiline!: boolean;

  @Expose()
  @Type(() => String)
  icon!: string;

  @Expose()
  @Type(() => Number)
  min!: number;

  @Expose()
  @Type(() => Number)
  max!: number;

  @Expose()
  @Type(() => Number)
  step!: number;

  @Expose()
  @Transform(primitiveTransformer)
  default!: Primitive;

  @Expose()
  @Type(() => primitiveArrayTransformer)
  enum!: Primitive[];

  @Expose()
  @Type(() => Boolean)
  freeform!: boolean;

  @Expose()
  @Type(() => String)
  placeholder!: string;

  @Expose()
  @Type(() => Extension)
  extensions!: Extension[];

  @Expose()
  @Transform(objectsMapTransformer(InputFlow))
  flows!: Map<string, InputFlow>;

  @Expose()
  @Type(() => Arrange)
  arrange!: Arrange;
}

export class PipelineOutput {
  @Expose()
  @Type(() => Number)
  order!: number;

  @Expose()
  @Type(() => String)
  title!: string;

  @Expose()
  @Type(() => String)
  type!: PipelineIOType;

  @Expose()
  @Type(() => Boolean)
  multiline!: boolean;

  @Expose()
  @Transform(objectsMapTransformer(OutputFlow))
  flows!: Map<string, OutputFlow>;

  @Expose()
  @Type(() => Arrange)
  arrange!: Arrange;
}

export class Pipeline {
  @Expose()
  @Type(() => String)
  name!: string;

  @Expose()
  @Type(() => Number)
  version!: number;

  @Expose()
  @Type(() => String)
  description!: string;

  @Expose()
  @Type(() => String)
  tags!: string[];

  @Expose()
  @Type(() => String)
  readme!: string;

  @Expose()
  @Type(() => String)
  url!: string;

  @Expose()
  @Type(() => Boolean)
  checkUpdates!: boolean;

  @Expose()
  @Type(() => String)
  thumbnail!: string;

  @Expose()
  @Type(() => PipelineCategory)
  category!: PipelineCategory;

  @Expose()
  @Type(() => String)
  script!: string;

  @Expose()
  @Type(() => Start)
  start!: Start;

  @Expose()
  @Type(() => DeployConfig)
  deploy!: DeployConfig;

  @Expose()
  @Transform(objectsMapTransformer(PipelineInput))
  inputs!: Map<string, PipelineInput>;

  @Expose()
  @Transform(objectsMapTransformer(PipelineOutput))
  outputs!: Map<string, PipelineOutput>;

  @Expose()
  @Transform(objectsMapTransformer(NodeFlow))
  flows!: Map<string, NodeFlow>;

  @Expose()
  @Transform(objectsMapTransformer(Node))
  nodes: Map<string, Node>;
}

export class NodeCosts {
  @Expose()
  @Type(() => String)
  node!: string;

  @Expose()
  @Type(() => Number)
  costs!: number;

  @Expose()
  @Type(() => String)
  details!: string;

  constructor(defs: Partial<NodeCosts> = {}) {
    assign(this, defs);
  }
}

export class PipelineCosts {
  @Expose()
  @Type(() => Number)
  pipeline!: number;

  @Expose()
  @Transform(objectsMapTransformer(NodeCosts))
  nodes!: Map<string, NodeCosts>;

  @Expose()
  @Type(() => Number)
  total!: number;

  convert() {
    this.pipeline *= UNIT_COST;
    if (!!this.nodes) {
      for (const [id, node] of this.nodes) {
        node.costs *= UNIT_COST;
      }
    }

    return this;
  }

  update() {
    this.total = this.pipeline;
    if (!!this.nodes) {
      this.total += [...this.nodes.values()].reduce(
        (costs, n) => costs + n.costs,
        0
      );
    }
    return this;
  }

  constructor(defs: Partial<PipelineCosts> = {}) {
    assign(this, defs);
  }
}
