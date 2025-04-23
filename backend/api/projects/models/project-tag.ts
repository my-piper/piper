import { Expose, Type } from "class-transformer";
import { Languages } from "core-kit/enums/languages";

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
