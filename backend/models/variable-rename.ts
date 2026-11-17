import { Expose, Matches, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

/** The new name for a Variable in the User Environment. */
export class VariableRename {
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/)
  @Expose()
  @Type(() => String)
  name!: string;

  constructor(defs: Partial<VariableRename> = {}) {
    assign(this, defs);
  }
}
