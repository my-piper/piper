import { Expose, Transform, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";
import { Arrange } from "src/models/arrange";
import { InputFlow } from "src/models/input-flow";
import { NodeFlow } from "src/models/node-flow";
import {
  primitiveArrayTransformer,
  primitiveTransformer,
} from "src/transformers/primitive";
import { PipelineIOType } from "src/types/pipeline";
import { Primitive } from "src/types/primitive";
import { DeployConfig } from "./deploy-config";
import { Extension } from "./extension";
import { Node } from "./node";
import { OutputFlow } from "./output-flow";
import { PipelineCategory } from "./pipeline-category";

export class Start {
  @Expose()
  @Type(() => String)
  nodes!: string[];
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
  @Type(() => InputFlow)
  flows!: Map<string, InputFlow>;

  @Expose()
  @Type(() => Arrange)
  arrange!: Arrange;

  constructor(defs: Partial<PipelineInput> = {}) {
    assign(this, defs);
  }
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
  @Type(() => OutputFlow)
  flows!: Map<string, OutputFlow>;

  @Expose()
  @Type(() => Arrange)
  arrange!: Arrange;

  constructor(defs: Partial<PipelineOutput> = {}) {
    assign(this, defs);
  }
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
  @Type(() => Start)
  start!: Start;

  @Expose()
  @Type(() => DeployConfig)
  deploy!: DeployConfig;

  @Expose()
  @Type(() => PipelineInput)
  inputs!: Map<string, PipelineInput>;

  @Expose()
  @Type(() => PipelineOutput)
  outputs!: Map<string, PipelineOutput>;

  @Expose()
  @Type(() => NodeFlow)
  flows!: Map<string, NodeFlow>;

  @Expose()
  @Type(() => Node)
  nodes!: Map<string, Node>;
}

export class NodeCosts {
  @Expose()
  @Type(() => String)
  node!: string;

  @Expose()
  @Type(() => Number)
  costs!: number;

  constructor(defs: Partial<NodeCosts> = {}) {
    assign(this, defs);
  }
}

export class PipelineCosts {
  @Expose()
  @Type(() => NodeCosts)
  nodes!: NodeCosts[];

  @Expose()
  @Type(() => Number)
  costs!: number;

  constructor(defs: Partial<PipelineCosts> = {}) {
    assign(this, defs);
  }
}
