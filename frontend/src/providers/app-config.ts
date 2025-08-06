export const BASE_URL = "base_url";
import { Expose, plainToInstance, Type } from "class-transformer";
import { ENV_MODE } from "src/consts/env";
import { AppConfig } from "src/models/app-config";
import { toInstance } from "src/utils/models";

export class Prerender {
  @Expose()
  @Type(() => AppConfig)
  config?: AppConfig;
}

declare var PRERENDER: Prerender;
const PRERENDER_KEY = "prerender";

export function appConfigFactory(): AppConfig {
  const prerender = (() => {
    const json =
      PRERENDER ||
      (() => {
        const json = localStorage.getItem(PRERENDER_KEY);
        if (!!json) {
          return JSON.parse(json);
        }
        return null;
      })();
    if (!!json) {
      return toInstance(json, Prerender);
    }

    return null;
  })();

  return plainToInstance(
    AppConfig,
    prerender?.config || {
      billing: {
        active: ENV_MODE == "development",
        url: "https://google.com",
      },
      captcha:
        ENV_MODE == "development"
          ? {
              required: true,
              key: "10000000-ffff-ffff-ffff-000000000001",
            }
          : {
              required: false,
              key: null,
            },
      ui: {
        features: ["signup", "google_auth", "yandex_auth"],
      },
      baseUrl: location.origin,
      appFooter: "<div>Pipelines builder 2025</div>",
    }
  );
}
