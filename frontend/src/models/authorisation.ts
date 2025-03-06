import { Expose, Type } from "class-transformer";
import { User } from "./user";

export class Authorization {
  @Expose()
  @Type(() => String)
  token!: string;

  @Expose()
  @Type(() => User)
  user!: User;
}
