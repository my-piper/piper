import {
  Expose,
  MaxLength,
  MinLength,
  Type,
} from "core-kit/packages/transform";

export class ChangePasswordRequest {
  @MinLength(6)
  @MaxLength(32)
  @Expose()
  @Type(() => String)
  password!: string;
}
