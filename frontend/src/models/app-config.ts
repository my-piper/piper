import { Expose, plainToInstance, Type } from "class-transformer";
import assign from "lodash/assign";
import { BehaviorSubject } from "rxjs";
import { AUTHORIZATION_KEY } from "src/consts/core";
import { toPlain } from "src/utils/models";
import { Authorization } from "./authorisation";

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
