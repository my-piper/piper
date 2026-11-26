import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { OAuthProvider } from "packages/users/types";

export enum UserRole {
  admin = "admin",
  engineer = "engineer",
}

export enum IdentityProvider {
  oidc = "oidc",
}

export class UserIdentity {
  @Expose()
  @Type(() => String)
  provider!: IdentityProvider;

  @Expose()
  @Type(() => String)
  subject!: string;

  @Expose()
  @Type(() => String)
  email!: string;

  @Expose()
  @Type(() => Date)
  linkedAt!: Date;

  constructor(defs: Partial<UserIdentity> = {}) {
    assign(this, defs);
  }
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
  provider!: OAuthProvider;

  @Expose()
  @Type(() => UserIdentity)
  identities?: UserIdentity[];

  @Expose()
  @Type(() => String)
  cursor!: string;

  constructor(defs: Partial<User> = {}) {
    assign(this, defs);
  }
}
