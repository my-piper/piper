import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class UserCredentials {
  @Expose()
  @Type(() => String)
  identity!: string;

  @Expose()
  @Type(() => String)
  password!: string;

  constructor(defs: Partial<UserCredentials> = {}) {
    assign(this, defs);
  }
}
