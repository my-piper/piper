import env from "core-kit/env";

export const BILLING_URL = env["BILLING_URL"] || null;

export const INITIAL_USER_BALANCE =
  (() => {
    const value = process.env["INITIAL_USER_BALANCE"];
    if (!!value) {
      return parseInt(value);
    }
    return null;
  })() || 0;

export const TRACK_BALANCE = env["TRACK_BALANCE"] === "yes";
export const MIN_BALANCE_FOR_TRACK =
  (() => {
    const value = process.env["MIN_BALANCE_FOR_TRACK"];
    if (!!value) {
      return parseFloat(value);
    }
    return null;
  })() || 0;
