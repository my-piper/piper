import { Expose, Transform, Type } from "class-transformer";
import assign from "lodash/assign";
import { objectsMapTransformer } from "../transformers/map";
import { Node } from "./node";

export class NodePackage {
  @Expose()
  @Type(() => String)
  _id: string;

  @Expose()
  @Type(() => String)
  title: string;

  @Expose()
  @Type(() => String)
  description: string;

  @Expose()
  @Type(() => String)
  author: string;

  @Expose()
  @Type(() => String)
  url: string;

  @Expose()
  @Type(() => Number)
  version: number;

  @Expose()
  @Type(() => String)
  readme: string;

  @Expose()
  @Transform(objectsMapTransformer(Node))
  nodes: Map<string, Node>;

  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<NodePackage> = {}) {
    assign(this, defs);
  }
}

export class NodePackageUpdates {
  @Expose()
  @Type(() => String)
  errors: string;

  @Expose()
  @Type(() => NodePackage)
  current: NodePackage;

  @Expose()
  @Type(() => NodePackage)
  updated: NodePackage;

  constructor(defs: Partial<NodePackageUpdates> = {}) {
    assign(this, defs);
  }
}

export class NodePackageUpdatesState {
  @Expose()
  @Type(() => String)
  status?: "checking" | "updating";

  @Expose()
  @Type(() => NodePackageUpdates)
  updates: NodePackageUpdates[];

  constructor(defs: Partial<NodePackageUpdatesState> = {}) {
    assign(this, defs);
  }
}
