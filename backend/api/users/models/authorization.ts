import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { User } from "models/user";

export class Authorization {
  @Expose()
  @Type(() => String)
  token!: string;

  @Expose()
  @Type(() => User)
  user!: User;

  constructor(defs: Partial<Authorization> = {}) {
    assign(this, defs);
  }
}
