import { Expose, Type } from "class-transformer";
import { Length, Matches } from "class-validator";

export class UserCredentials {
  @Matches(/^[a-z0-9\-\_]{3,10}$/)
  @Expose()
  @Type(() => String)
  _id!: string;

  @Length(6, 20)
  @Expose()
  @Type(() => String)
  password!: string;
}
