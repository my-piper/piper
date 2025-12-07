import { Expose, Type } from "src/ui-kit/transformers";

export class ArtefactsFilter {
  @Expose()
  @Type(() => String)
  type?: string;

  @Expose()
  @Type(() => String)
  project?: string;

  @Expose()
  @Type(() => String)
  launch?: string;

  @Expose()
  @Type(() => String)
  node?: string;

  @Expose()
  @Type(() => String)
  cursor: string;
}
