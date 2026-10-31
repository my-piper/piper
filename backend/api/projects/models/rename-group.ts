import { Expose, IsNotEmpty, MaxLength } from "core-kit/packages/transform";
import { IsString } from "class-validator";
import assign from "lodash/assign";

export class RenameGroup {
  // folder path to rename, "Marketing/Video" renames a nested folder
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Expose()
  from: string;

  // new folder path, may move the folder to another parent
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Expose()
  to: string;

  constructor(defs: Partial<RenameGroup> = {}) {
    assign(this, defs);
  }
}
