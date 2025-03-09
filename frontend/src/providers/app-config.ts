export const BASE_URL = "base_url";
import { Expose, plainToInstance, Type } from "class-transformer";
import { AppConfig } from "src/models/app-config";

export class Prerender {
  @Expose()
  @Type(() => AppConfig)
  config?: AppConfig;
}

declare var PRERENDER: Prerender;

const APP_CONFIG_KEY = "app-config";

export function appConfigFactory(): AppConfig {
  return plainToInstance(
    AppConfig,
    (() => {
      const config = PRERENDER.config;
      if (!!config) {
        localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(config));
        return config;
      }
      return null;
    })() ||
      (() => {
        const config = localStorage.getItem(APP_CONFIG_KEY);
        if (!!config) {
          try {
            return JSON.parse(config);
          } catch (e) {
            console.error(e);
          }
        }
        return null;
      })() || {
        billing: {
          url: "https://google.com",
        },
        baseUrl: location.origin,
      }
  );
}
