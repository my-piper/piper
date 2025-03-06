import * as sentry from "@sentry/node";

sentry.init({
  dsn: "https://e5520383163c8e0e065b276a517671a1@sentry.pornworks.ai/17",
  tracesSampleRate: 1.0,
});

export default sentry;
