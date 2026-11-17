import { Expose, Type } from "class-transformer";

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
