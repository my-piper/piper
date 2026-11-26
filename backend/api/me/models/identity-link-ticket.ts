import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export class IdentityLinkTicket {
  @Expose()
  @Type(() => String)
  ticket!: string;

  constructor(defs: Partial<IdentityLinkTicket> = {}) {
    assign(this, defs);
  }
}
