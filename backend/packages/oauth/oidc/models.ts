import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export class OidcState {
  @Expose()
  @Type(() => String)
  verifier!: string;

  @Expose()
  @Type(() => String)
  nonce!: string;

  /** Set when a signed-in user connects the identity instead of signing in. */
  @Expose()
  @Type(() => String)
  userId?: string;

  constructor(defs: Partial<OidcState> = {}) {
    assign(this, defs);
  }
}
