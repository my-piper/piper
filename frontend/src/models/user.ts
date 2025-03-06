import { Expose, Type } from "class-transformer";

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
  name!: string;

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
}
