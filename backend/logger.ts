import pino from "pino";
import { LOG_LEVEL, LOG_PRETTY } from "./consts/core";

const logger = pino(
  LOG_PRETTY
    ? {
        level: LOG_LEVEL,
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {
        level: LOG_LEVEL,
        formatters: {
          level: (label: string) => ({ level: label }),
        },
      }
);

export function createLogger(
  module: string,
  opts: { [key: string]: string } = {}
) {
  return logger.child({ module, ...opts });
}
