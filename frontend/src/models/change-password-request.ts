import { Expose, Type } from "class-transformer";

export class ChangePasswordRequest {
  @Expose()
  @Type(() => String)
  password!: string;
}
