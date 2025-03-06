import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import { UserRole } from "./user";

export class AddUserRequest {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => String)
  name!: string;

  @Expose()
  @Type(() => String)
  email!: string;

  @Expose()
  @Type(() => String)
  password!: string;

  @Expose()
  @Type(() => String)
  role!: UserRole;

  constructor(defs: Partial<AddUserRequest> = {}) {
    assign(this, defs);
  }
}

export class UpdateUserRequest {
  @Expose()
  @Type(() => String)
  name!: string;

  @Expose()
  @Type(() => String)
  email!: string;

  @Expose()
  @Type(() => String)
  password!: string;

  @Expose()
  @Type(() => String)
  role!: UserRole;

  constructor(defs: Partial<UpdateUserRequest> = {}) {
    assign(this, defs);
  }
}
