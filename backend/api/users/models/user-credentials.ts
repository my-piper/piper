import { Expose, Type } from "class-transformer";
import { Length } from "class-validator";

export class UserCredentials {
  @Expose()
  @Type(() => String)
  identity!: string;

  @Length(6, 20)
  @Expose()
  @Type(() => String)
  password!: string;
}
