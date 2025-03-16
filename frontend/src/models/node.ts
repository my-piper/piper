import { Expose, Transform, Type } from "class-transformer";
import assign from "lodash/assign";
import {
  primitiveArrayTransformer,
  primitiveTransformer,
} from "src/transformers/primitive";
import { PipelineIOType } from "src/types/pipeline";
import { Primitive } from "src/types/primitive";
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

  constructor(defs: Partial<NodeEnvironment>) {
    assign(this, defs);
  }
}

export class NodeCategory {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => String)
  id!: string;

  @Expose()
  @Type(() => String)
  title: string;

  @Expose()
  @Type(() => String)
  thumbnail: string;

  toString() {
    return this._id;
  }
}

export class NodeCatalog {
  @Expose()
  @Type(() => String)
  id: string;

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

  constructor(defs: Partial<NodeCatalog> = {}) {
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
}

export class NodeInputSchema {
  @Expose()
  @Type(() => String)
  id: string;
}

export class NodeGroups {
  @Expose()
  @Type(() => InputGroup)
  inputs!: Map<string, InputGroup>;
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
  type!: PipelineIOType;

  @Expose()
  @Type(() => String)
  schema!: string;
}

type GroupOfInputs = {
  order: number;
  group: InputGroup | null;
  inputs: { id: string; input: NodeInput }[];
};

export class Node {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => Number)
  version!: number;

  @Expose()
  @Type(() => NodeCategory)
  category: NodeCategory;

  @Expose()
  @Type(() => String)
  package: string;

  @Expose()
  @Type(() => String)
  title!: string;

  @Expose()
  @Type(() => String)
  description!: string;

  @Expose()
  @Type(() => String)
  thumbnail!: string;

  @Expose()
  @Type(() => String)
  source: string;

  @Expose()
  @Type(() => String)
  script!: string;

  @Expose()
  @Type(() => String)
  costs!: string;

  @Expose()
  @Type(() => Arrange)
  arrange!: Arrange;

  @Expose()
  @Type(() => NodeGroups)
  groups!: NodeGroups;

  @Expose()
  @Type(() => NodeInput)
  inputs!: Map<string, NodeInput>;

  @Expose()
  @Type(() => NodeInput)
  outputs!: Map<string, NodeOutput>;

  @Expose()
  @Type(() => NodeCatalog)
  catalog!: NodeCatalog;

  @Expose()
  @Type(() => NodeEnvironment)
  environment!: Map<string, NodeEnvironment>;

  private _render: {
    inputs: { id: string; group: GroupOfInputs }[];
  } | null = null;

  get render() {
    if (!this._render) {
      this._render = this.getRender();
    }

    return this._render;
  }

  build() {
    this._render = this.getRender();
  }

  private getRender() {
    const groups = new Map<string, GroupOfInputs>();
    const orphan: GroupOfInputs = {
      order: 0,
      group: null,
      inputs: [],
    };
    for (const [k, v] of this.inputs) {
      if (!!v.group) {
        let group = groups.get(v.group);
        if (!group) {
          const g = this.groups.inputs.get(v.group);
          if (!g) {
            console.error(`Input group ${v.group} not found`);
            continue;
          }
          groups.set(v.group, {
            order: g.order,
            group: g,
            inputs: [],
          });
        }
        groups.get(v.group).inputs.push({ id: k, input: v });
      } else {
        orphan.inputs.push({ id: k, input: v });
      }
    }
    groups.set(null, orphan);
    return {
      inputs: (() => {
        const sorted = [];
        for (const [k, v] of groups) {
          v.inputs.sort((a, b) => (a.input.order ?? 1) - (b.input.order ?? 1));
          sorted.push({ id: k, group: v });
        }
        sorted.sort((a, b) => (a.group.order ?? 1) - (b.group.order ?? 1));
        return sorted;
      })(),
    };
  }
}

export class NodeStatus {
  @Expose()
  @Type(() => String)
  state!: "stopped" | "running" | "done" | "error";

  @Expose()
  @Type(() => String)
  error!: string;
}
