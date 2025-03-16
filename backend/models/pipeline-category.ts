import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class PipelineCategory {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => String)
  title!: string;

  @Expose()
  @Type(() => String)
  icon!: string;

  @Expose()
  @Type(() => Number)
  projects!: number;

  @Expose()
  @Type(() => Number)
  order!: number;

  constructor(defs: Partial<PipelineCategory> = {}) {
    assign(this, defs);
  }
}
