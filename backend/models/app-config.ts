import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class BillingConfig {
  @Expose()
  @Type(() => String)
  url?: string;

  constructor(defs: Partial<BillingConfig> = {}) {
    assign(this, defs);
  }
}

export class AppConfig {
  @Expose()
  @Type(() => BillingConfig)
  billing?: BillingConfig;

  @Expose()
  @Type(() => String)
  baseUrl?: string;

  @Expose()
  @Type(() => String)
  siteUrl?: string;

  @Expose()
  @Type(() => String)
  appFooter?: string;

  constructor(defs: Partial<AppConfig> = {}) {
    assign(this, defs);
  }
}
