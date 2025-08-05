import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class SignupRequest {
  @Expose()
  @Type(() => String)
  email!: string;

  @Expose()
  @Type(() => String)
  login!: string;

  @Expose()
  @Type(() => String)
  password!: string;

  @Expose()
  @Type(() => String)
  captcha!: string;

  constructor(defs: Partial<SignupRequest> = {}) {
    assign(this, defs);
  }
}
