import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { OAuthProvider } from "packages/users/types";

export class UserBalance {
  @Expose()
  @Type(() => Number)
  available!: number;

  @Expose()
  @Type(() => Number)
  used!: number;

  @Expose()
  @Type(() => Number)
  remaining!: number;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;

  constructor(defs: Partial<UserBalance> = {}) {
    assign(this, defs);
  }
}

export enum UserRole {
  admin = "admin",
  engineer = "engineer",
}

export class User {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => String)
  password!: string;

  @Expose()
  @Type(() => String)
  email!: string;

  @Expose()
  @Type(() => String)
  roles!: UserRole[];

  @Expose()
  @Type(() => UserBalance)
  balance!: UserBalance;

  @Expose()
  @Type(() => String)
  provider!: OAuthProvider;

  @Expose()
  @Type(() => String)
  cursor!: string;

  constructor(defs: Partial<User> = {}) {
    assign(this, defs);
  }
}
