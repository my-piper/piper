import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

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
  @Type(() => String)
  provider: "yandex" | "google";

  @Expose()
  @Type(() => UserBalance)
  balance!: UserBalance;

  @Expose()
  @Type(() => String)
  cursor?: string;
}

export class UsersFilter {
  @Expose()
  @Type(() => String)
  query?: string;

  @Expose()
  @Type(() => String)
  cursor?: string;

  constructor(defs: Partial<UsersFilter> = {}) {
    assign(this, defs);
  }
}
