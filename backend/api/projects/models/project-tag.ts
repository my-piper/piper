import { Languages } from "core-kit/packages/locale";
import { Expose, Type } from "core-kit/packages/transform";

export class ProjectTag {
  @Expose()
  @Type(() => String)
  _id: string;

  @Expose()
  @Type(() => String)
  tag: string;

  @Expose()
  @Type(() => String)
  project: string;

  @Expose()
  @Type(() => String)
  language?: Languages;
}
