import { Expose, Transform, Type } from "class-transformer";
import assign from "lodash/assign";
import merge from "lodash/merge";
import { PipelineIOType } from "types/pipeline";
import { objectsMapTransformer } from "../transformers/map";
import {
  primitiveArrayTransformer,
  primitiveTransformer,
} from "../transformers/primitive";
import { Primitive } from "../types/primitive";
import { Arrange } from "./arrange";
import { Extension } from "./extension";

export class NodeEnvironment {
  @Expose()
  @Type(() => String)
  title: string;

  @Expose()
  @Type(() => String)
  description: string;

  @Expose()
  @Type(() => String)
  type: string;

  @Expose()
  @Type(() => String)
  scope: "global" | "user" | "pipeline";

  constructor(defs: Partial<NodeEnvironment> = {}) {
    assign(this, defs);
  }
}

export class NodeCategory {
  @Expose()
  @Type(() => String)
  id!: string;

  @Expose()
  @Type(() => String)
  title: string;

  toString() {
    return this.id;
  }
}

export class NodeCatalog {
  @Expose()
  @Type(() => String)
  id: string;

  @Expose()
  @Type(() => Number)
  version: number;

  @Expose()
  @Type(() => NodeCategory)
  category: NodeCategory;

  @Expose()
  @Type(() => String)
  package: string;

  constructor(defs: Partial<NodeCatalog>) {
    assign(this, defs);
  }
}

export class NodeProgress {
  @Expose()
  @Type(() => Number)
  total: number;

  @Expose()
  @Type(() => Number)
  processed: number;

  @Expose()
  @Type(() => Number)
  losses: number;

  constructor(defs: Partial<NodeProgress> = {}) {
    assign(this, defs);
  }
}

export class InputGroup {
  @Expose()
  @Type(() => Number)
  order!: number;

  @Expose()
  @Type(() => String)
  title!: string;

  @Expose()
  @Type(() => String)
  description!: string;
}

export class NodeInputSchema {
  @Expose()
  @Type(() => String)
  id: string;
}

export class NodeGroups {
  @Expose()
  @Transform(objectsMapTransformer(InputGroup))
  inputs!: Map<string, InputGroup>;
}

export class NodeInput {
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
  group!: string;

  @Expose()
  @Type(() => String)
  type!: PipelineIOType;

  @Expose()
  @Type(() => String)
  icon!: string;

  @Expose()
  @Type(() => Boolean)
  required!: boolean;

  @Expose()
  @Type(() => Boolean)
  multiline!: boolean;

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
  @Type(() => String)
  placeholder!: string;

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
  @Type(() => NodeInputSchema)
  schema!: NodeInputSchema;

  @Expose()
  @Type(() => Extension)
  extensions!: Extension[];
}

export class NodeOutput {
  @Expose()
  @Type(() => String)
  title!: string;

  @Expose()
  @Type(() => Arrange)
  arrange!: Arrange;

  @Expose()
  @Type(() => String)
  type!: string;

  @Expose()
  @Type(() => String)
  schema!: string;
}

export class Node {
  @Expose()
  @Type(() => String)
  _id: string;

  @Expose()
  @Type(() => Number)
  version: number;

  @Expose()
  @Type(() => NodeCategory)
  category: NodeCategory;

  @Expose()
  @Type(() => String)
  package: string;

  @Expose()
  @Type(() => String)
  title: string;

  @Expose()
  @Type(() => String)
  source: string;

  @Expose()
  @Type(() => String)
  script: string;

  @Expose()
  @Type(() => Arrange)
  arrange: Arrange;

  @Expose()
  @Type(() => NodeGroups)
  groups!: NodeGroups;

  @Expose()
  @Transform(objectsMapTransformer(NodeInput))
  inputs: Map<string, NodeInput>;

  @Expose()
  @Transform(objectsMapTransformer(NodeOutput))
  outputs: Map<string, NodeOutput>;

  @Expose()
  @Type(() => NodeCatalog)
  catalog!: NodeCatalog;

  @Expose()
  @Transform(objectsMapTransformer(NodeEnvironment))
  environment!: Map<string, NodeEnvironment>;
}

export class NodeStatus {
  @Expose()
  @Type(() => String)
  state: "running" | "done" | "error";

  @Expose()
  @Type(() => String)
  error: string;

  constructor(defs: Partial<NodeStatus> = {}) {
    merge(this, defs);
  }
}
