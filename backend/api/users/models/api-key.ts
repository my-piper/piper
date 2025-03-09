import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class ApiKey {
  @Expose()
  @Type(() => String)
  hash!: string;

  constructor(defs: Partial<ApiKey> = {}) {
    assign(this, defs);
  }
}
