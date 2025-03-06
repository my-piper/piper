import "core-kit/env";

export const SHARE_FOLDER = process.env["SHARE_FOLDER"] || "/tmp/share";
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

export const CHROME_HEADLESS = process.env["CHROME_HEADLESS"] !== "no";
