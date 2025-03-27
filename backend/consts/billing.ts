import env from "core-kit/env";

export const BILLING_URL = env["BILLING_URL"] || null;

export const INITIAL_USER_BALANCE =
  (() => {
    const port = process.env["INITIAL_USER_BALANCE"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 0;
