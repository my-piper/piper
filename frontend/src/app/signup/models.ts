import { Expose, Type } from "class-transformer";

export class ConfirmEmailRequest {
  @Expose()
  @Type(() => String)
  email!: string;

  @Expose()
  @Type(() => String)
  captcha!: string;
}

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
  code!: string;
}
