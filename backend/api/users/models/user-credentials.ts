import { Expose, Length, Type } from "core-kit/packages/transform";

export class UserCredentials {
  @Expose()
  @Type(() => String)
  identity!: string;

  @Length(6, 20)
  @Expose()
  @Type(() => String)
  password!: string;
}
