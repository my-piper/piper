import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export class UiConfig {
  @Expose()
  @Type(() => String)
  features?: ("signup" | "google_auth" | "yandex_auth")[];

  @Expose()
  @Type(() => String)
  appFooter?: string;

  constructor(defs: Partial<UiConfig> = {}) {
    assign(this, defs);
  }
}

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
  @Type(() => UiConfig)
  ui?: UiConfig;

  @Expose()
  @Type(() => String)
  baseUrl?: string;

  @Expose()
  @Type(() => String)
  siteUrl?: string;

  constructor(defs: Partial<AppConfig> = {}) {
    assign(this, defs);
  }
}
