import { Expose, Type } from "class-transformer";
import { MaxLength, MinLength } from "class-validator";

export class ChangePasswordRequest {
  @MinLength(6)
  @MaxLength(32)
  @Expose()
  @Type(() => String)
  password!: string;
}
