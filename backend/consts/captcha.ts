import env from "core-kit/env";

export const CAPTCHA_REQUIRED = env["CAPTCHA_REQUIRED"] === "yes";
export const CAPTCHA_SECRET = env["CAPTCHA_SECRET"] || "xyzXYZ";
export const CAPTCHA_SITE_KEY = env["CAPTCHA_SITE_KEY"] || "xyzXYZ";
