import { Expose, plainToInstance, Type } from "class-transformer";
import assign from "lodash/assign";
import { BehaviorSubject } from "rxjs";
import { AUTHORIZATION_KEY } from "src/consts/core";
import { toPlain } from "src/utils/models";
import { Authorization } from "./authorisation";

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

export class CaptchaConfig {
  @Expose()
  @Type(() => Boolean)
  required?: boolean;

  @Expose()
  @Type(() => String)
  key?: string;

  constructor(defs: Partial<CaptchaConfig> = {}) {
    assign(this, defs);
  }
}

export class AppConfig {
  @Expose()
  @Type(() => BillingConfig)
  billing?: BillingConfig;

  @Expose()
  @Type(() => CaptchaConfig)
  captcha?: CaptchaConfig;

  @Expose()
  @Type(() => UiConfig)
  ui?: UiConfig;

  @Expose()
  @Type(() => String)
  baseUrl?: string;

  @Expose()
  @Type(() => String)
  siteUrl?: string;

  authorization$ = new BehaviorSubject<Authorization | null>(
    (() => {
      const json = localStorage.getItem(AUTHORIZATION_KEY);
      return !!json ? plainToInstance(Authorization, JSON.parse(json)) : null;
    })()
  );

  set authorization(authorization: Authorization | null) {
    if (!!authorization) {
      localStorage.setItem(
        AUTHORIZATION_KEY,
        JSON.stringify(toPlain(authorization))
      );
    } else {
      localStorage.removeItem(AUTHORIZATION_KEY);
    }

    this.authorization$.next(authorization);
  }

  get authorization() {
    return this.authorization$.getValue();
  }
}
