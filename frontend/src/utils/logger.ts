export enum LogLevel {
  debug = 0,
  info = 1,
  warn = 2,
  error = 3,
}
export function createLogger(module: string, level: LogLevel = LogLevel.info) {
  return {
    debug:
      level >= LogLevel.debug
        ? (...args: any[]) => console.log(module, ...args)
        : () => {},
    info:
      level >= LogLevel.info
        ? (...args: any[]) => console.log(module, ...args)
        : () => {},
    warn:
      level >= LogLevel.warn
        ? (...args: any[]) => console.log(module, ...args)
        : () => {},
    error:
      level >= LogLevel.error
        ? (...args: any[]) => console.log(module, ...args)
        : () => {},
  };
}
