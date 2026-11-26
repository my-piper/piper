import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { User } from "models/user";

/** The current user as `GET /api/me` returns it: no password hash. */
export class Me extends User {
  @Expose()
  @Type(() => Boolean)
  hasPassword!: boolean;

  constructor(defs: Partial<Me> = {}) {
    super();
    assign(this, defs);
  }
}
