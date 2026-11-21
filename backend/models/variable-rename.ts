import { VARIABLE_NAME } from "consts/core";
import { Expose, Matches, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

/** The new name for a Variable in the User Environment. */
export class VariableRename {
  @Matches(VARIABLE_NAME)
  @Expose()
  @Type(() => String)
  name!: string;

  constructor(defs: Partial<VariableRename> = {}) {
    assign(this, defs);
  }
}
