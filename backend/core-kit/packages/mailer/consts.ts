import env from "../../env";

export const SMTP_HOST = env["SMTP_HOST"] || "localhost";
export const SMTP_PORT =
  (() => {
    const max = env["SMTP_PORT"];
    if (!!max) {
      return parseInt(max);
    }
    return null;
  })() || 587;
export const SMTP_SECURE = env["SMTP_SECURE"] === "true";
export const SMTP_USER = env["SMTP_USER"] || "user";
export const SMTP_PASSWORD = env["SMTP_PASSWORD"] || "xyzXYZ";
export const SMTP_FROM = env["SMTP_FROM"] || "admin@localhost";
