import env from "core-kit/env";
import { expire, increment } from "core-kit/packages/redis";
import { DataError } from "core-kit/types/errors";
import { User } from "models/user";

export const MIN_BALANCE =
  (() => {
    const port = env["RATE_LIMIT_MIN_BALANCE"];
    if (!!port) {
      return parseInt(port);
    }
    return null;
  })() || 0;

export const WINDOW_SIZE_IN_SECONDS =
  (() => {
    const port = env["RATE_LIMIT_WINDOW_SIZE"];
    if (!!port) {
      return parseInt(port);
    }
    return null;
  })() || 60;

export const MAX_REQUESTS =
  (() => {
    const port = env["RATE_LIMIT_MAX_REQUESTS"];
    if (!!port) {
      return parseInt(port);
    }
    return null;
  })() || 5;

const RATE_LIMITS_KEY = (user: string) => {
  const now = Math.floor(Date.now() / 1000);
  return `rate-limit:${user}:${Math.floor(now / WINDOW_SIZE_IN_SECONDS)}`;
};
export async function checkRateLimits({ _id, balance }: User) {
  if (MIN_BALANCE > 0) {
    if ((balance?.available || 0) < MIN_BALANCE) {
      const windowKey = RATE_LIMITS_KEY(_id);
      const requests = await increment(windowKey);
      if (requests === 1) {
        await expire(windowKey, WINDOW_SIZE_IN_SECONDS);
      }

      if (requests > MAX_REQUESTS) {
        throw new DataError(
          `Top up your balance to unlock higher rate limits.`,
          {
            minBalance: MIN_BALANCE,
          }
        );
      }
    }
  }
}
