import "core-kit/env";

export const CHROME_USER_DIR =
  process.env["CHROME_USER_DIR"] || "./chrome-data";
export const CHROME_REMOTE_POST =
  (() => {
    const port = process.env["CHROME_REMOTE_POST"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 9222;
export const CHROME_SERVICE_POST =
  (() => {
    const port = process.env["CHROME_SERVICE_POST"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 80;

export const CHROME_HEADLESS = process.env["CHROME_HEADLESS"] !== "no";
