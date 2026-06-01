import * as sentry from "@sentry/node";
import { createLogger } from "core-kit/packages/logger";
import { SENTRY_DSN } from "./consts";

const logger = createLogger("sentry");
logger.info(!!SENTRY_DSN ? `Use DSN: ${SENTRY_DSN}` : "No DSN configured");

sentry.init({
  dsn: SENTRY_DSN,
  tracesSampleRate: 1.0,
});

export default sentry;
