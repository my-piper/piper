import env from "core-kit/env";
import "reflect-metadata";

import { createLogger } from "core-kit/packages/logger";
import oauth from "packages/oauth";

const logger = createLogger("oauth");

const PORT =
  (() => {
    const port = env["OAUTH_PORT"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 80;

oauth.listen(PORT, () => {
  logger.debug("Server is running");
});
