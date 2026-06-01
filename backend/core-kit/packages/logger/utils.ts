import Pino from "pino";
import { LOG_LEVEL, LOG_PRETTY } from "./consts";

const logger = Pino(
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
      },
);

export function createLogger(
  module: string,
  opts: { [key: string]: string } = {},
) {
  return logger.child({ name: module, ...opts });
}
