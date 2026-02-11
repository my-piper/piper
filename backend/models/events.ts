import { Expose, Transform, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { objectsMapTransformer } from "transformers/map";
import { LaunchArtefact, LaunchInput } from "./launch";

export class PipelineEvent {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  node: string;
}

export class HeartbeatEvent {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => Date)
  heartbeat: Date;
}

export class SetLaunchInputsEvent {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Transform(objectsMapTransformer(LaunchInput))
  inputs!: Map<string, LaunchInput>;

  constructor(defs: Partial<SetLaunchInputsEvent> = {}) {
    assign(this, defs);
  }
}

export class SetLaunchOutputEvent {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  id: string;

  @Expose()
  @Type(() => LaunchArtefact)
  output: LaunchArtefact;

  constructor(defs: Partial<SetLaunchOutputEvent> = {}) {
    assign(this, defs);
  }
}

export class SetLaunchErrorsEvent {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  errors: string[];

  constructor(defs: Partial<SetLaunchErrorsEvent>) {
    assign(this, defs);
  }
}

export class PackageUpdatedEvent {
  @Expose()
  @Type(() => String)
  nodePackage: string;

  constructor(defs: Partial<PackageUpdatedEvent>) {
    assign(this, defs);
  }
}

export class BalanceUpdatedEvent {
  @Expose()
  @Type(() => String)
  user: string;

  constructor(defs: Partial<BalanceUpdatedEvent>) {
    assign(this, defs);
  }
}
