import { Provider } from "@angular/core";
import { AUTHORIZATION_KEY, USER_KEY } from "src/consts/core";
import { AppConfig } from "src/models/app-config";
import { appConfigFactory } from "src/providers/app-config";
import { PlainAppConfig, testRuntimeConfig } from "../fixtures/runtime-config";

export { TEST_BASE_URL } from "../fixtures/runtime-config";

type PrerenderGlobal = { PRERENDER?: { config?: PlainAppConfig } | null };

/**
 * Mirrors the `PRERENDER` constant index.html declares. Must run before
 * AppConfig is constructed; `appConfigFactory` reads it on construction.
 */
export function installPrerender(config: PlainAppConfig | null) {
  (globalThis as PrerenderGlobal).PRERENDER =
    config === null ? null : { config };
}

/** Called before every spec by the isolation layer. */
export function resetPrerender() {
  installPrerender(testRuntimeConfig());
}

/** AppConfig built by the production factory from the installed PRERENDER. */
export function provideTestConfig(
  overrides: Partial<PlainAppConfig> = {},
): Provider {
  installPrerender(testRuntimeConfig(overrides));
  return { provide: AppConfig, useFactory: appConfigFactory, deps: [] };
}

export const FAKE_TOKEN = "test-user-token";

/** Seeds stored authorization/user before AppConfig/MeManager are constructed. */
export function seedAuthorization(user: object, token = FAKE_TOKEN) {
  localStorage.setItem(AUTHORIZATION_KEY, JSON.stringify({ token, user }));
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
