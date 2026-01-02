import {
  Expose,
  IsOptional,
  Matches,
  Type,
  ValidateNested,
} from "core-kit/packages/transform";
import assign from "lodash/assign";
import { RunScope } from "./run-scope";

export class DeployConfig {
  @IsOptional()
  @Matches(/^[a-z0-9\-\_\.]{3,15}$/)
  @Expose()
  @Type(() => String)
  prefix!: string;

  @Expose()
  @Matches(/^[a-z0-9\-_]{5,40}$/)
  @Type(() => String)
  slug!: string;

  @IsOptional()
  @ValidateNested()
  @Expose()
  @Type(() => RunScope)
  scope!: RunScope;

  constructor(defs: Partial<DeployConfig> = {}) {
    assign(this, defs);
  }
}
