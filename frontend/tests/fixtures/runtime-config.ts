/**
 * Plain runtime config as the backend injects it into `PRERENDER.config`
 * (backend/server.ts). Shared with the browser suite: no Angular imports.
 */
export type PlainAppConfig = {
  assistant?: { active?: boolean };
  captcha?: { required?: boolean; key?: string | null };
  ui?: {
    features?: ("signup" | "google_auth" | "yandex_auth")[];
    appFooter?: string;
  };
  baseUrl?: string;
  siteUrl?: string;
};

export const TEST_BASE_URL = "http://piper.test";

/** Signup on, captcha/assistant/OAuth off, dummy base URL. */
export function testRuntimeConfig(
  overrides: Partial<PlainAppConfig> = {},
): PlainAppConfig {
  return {
    assistant: { active: false },
    captcha: { required: false, key: null },
    ui: { features: ["signup"], appFooter: "<div>test footer</div>" },
    baseUrl: TEST_BASE_URL,
    siteUrl: TEST_BASE_URL,
    ...overrides,
  };
}

export const RUNTIME_VARIANTS = {
  signupOff: (): Partial<PlainAppConfig> => ({ ui: { features: [] } }),
  captchaOn: (): Partial<PlainAppConfig> => ({
    // hCaptcha's documented always-pass test site key.
    captcha: { required: true, key: "10000000-ffff-ffff-ffff-000000000001" },
  }),
};
