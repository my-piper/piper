import { Expose, Transform, Type } from "class-transformer";
import assign from "lodash/assign";
import { NodeExecution } from "src/enums/node-execution";
import { objectTransformer } from "src/transformers/object";
import {
  primitiveArrayTransformer,
  primitiveTransformer,
} from "src/transformers/primitive";
import { PipelineIOType } from "src/types/pipeline";
import { Primitive } from "src/types/primitive";
import { mapTo } from "src/utils/models";
import { Arrange } from "./arrange";

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
  title: string;

  @Expose()
  @Type(() => String)
  thumbnail: string;

  @Expose()
  @Type(() => String)
  icon: string;

  @Expose()
  @Type(() => Number)
  order: number;

  toString() {
    return this._id;
  }
}

export class NodeCatalog {
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

export class DynamicInput {
  @Expose()
  @Type(() => String)
  group: string;

  @Expose()
  @Type(() => String)
  id: string;

  @Expose()
  @Type(() => String)
  title: string;

  @Expose()
  @Type(() => Number)
  index: number;

  @Expose()
  @Type(() => Boolean)
  cloned: boolean;
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
  featured!: boolean;

  @Expose()
  @Type(() => DynamicInput)
  dynamic!: DynamicInput;

  @Expose()
  @Type(() => Boolean)
  cloned: boolean;

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
  format!: string;

  @Expose()
  @Type(() => String)
  language!: string;

  @Expose()
  @Type(() => String)
  schema!: string;

  @Expose()
  @Type(() => Boolean)
  featured!: boolean;
}

type GroupOfInputs = {
  order: number;
  group: InputGroup | null;
  inputs: { id: string; input: NodeInput }[];
};

const DEFAULT_ORDER = 999;

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
  icon: string;

  @Expose()
  @Type(() => Number)
  order: number;

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
  tags!: string[];

  @Expose()
  @Type(() => String)
  source: string;

  @Expose()
  @Type(() => String)
  execution!: NodeExecution;

  @Expose()
  @Type(() => String)
  script!: string;

  @Expose()
  @Type(() => String)
  app!: string;

  @Expose()
  @Type(() => String)
  sign!: string;

  @Expose()
  @Type(() => Boolean)
  locked: boolean;

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
  @Type(() => NodeOutput)
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
    console.log("Render", this._render);
  }

  private getRender() {
    const groups = new Map<string, GroupOfInputs>();
    const orphan: GroupOfInputs = {
      order: DEFAULT_ORDER,
      group: null,
      inputs: [],
    };
    this.groups ??= mapTo({ inputs: {} }, NodeGroups);

    for (const [k, v] of this.inputs) {
      if (!!v.group) {
        let group = groups.get(v.group);
        if (!group) {
          const g = this.groups.inputs.get(v.group);
          if (!g) {
            console.error(`Input group ${v.group} not found`);
            orphan.inputs.push({ id: k, input: v });
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
          v.inputs.sort(
            (a, b) =>
              (a.input.order ?? DEFAULT_ORDER) -
              (b.input.order ?? DEFAULT_ORDER)
          );
          sorted.push({ id: k, group: v });
        }
        sorted.sort(
          (a, b) =>
            (a.group.order ?? DEFAULT_ORDER) - (b.group.order ?? DEFAULT_ORDER)
        );
        return sorted;
      })(),
    };
  }

  valid() {
    return true;
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

export class NodeToUpdate {
  @Expose()
  @Transform(objectTransformer)
  current: object;

  @Expose()
  @Transform(objectTransformer)
  changes: object;

  @Expose()
  @Type(() => Node)
  updated: Node;
}

export class PipelineNodeUpdates {
  @Expose()
  @Type(() => NodeToUpdate)
  updates: Map<string, NodeToUpdate>;
}

export class NodesFilter {
  @Expose()
  @Type(() => String)
  search?: string;
}
