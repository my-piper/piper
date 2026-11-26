import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

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
  @Type(() => UserIdentity)
  identities?: UserIdentity[];

  /** Only on `GET /api/me`. */
  @Expose()
  @Type(() => Boolean)
  hasPassword?: boolean;

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
