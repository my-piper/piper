import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class Artefact {
  @Expose()
  @Type(() => String)
  url!: string;

  constructor(defs: Partial<Artefact> = {}) {
    assign(this, defs);
  }
}
