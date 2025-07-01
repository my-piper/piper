import "reflect-metadata";

import { Expose, Type } from "core-kit/packages/transform";

export type User = {
  username: string;
  email: string;
};

export class OAuthEmail {
  @Expose()
  @Type(() => String)
  value: string;
}

export class OAuthProfile {
  @Expose()
  @Type(() => String)
  username: string;

  @Expose()
  @Type(() => OAuthEmail)
  emails: OAuthEmail[];
}
