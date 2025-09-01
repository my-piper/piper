import {
  Expose,
  IsEmail,
  IsOptional,
  Matches,
  Type,
} from "core-kit/packages/transform";

export class ConfirmEmailRequest {
  @IsEmail()
  @Expose()
  @Type(() => String)
  email!: string;

  @Expose()
  @IsOptional()
  @Type(() => String)
  captcha!: string;

  @Expose()
  @IsOptional()
  @Type(() => String)
  code!: string;
}

export class SignupRequest {
  @IsEmail()
  @Expose()
  @Type(() => String)
  email!: string;

  @Matches(/^[a-z0-9\-\_\.]{3,15}$/)
  @Expose()
  @Type(() => String)
  login!: string;

  @Expose()
  @Type(() => String)
  password!: string;

  @Expose()
  @IsOptional()
  @Type(() => String)
  code!: string;
}
