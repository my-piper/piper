import env from "../../env";

type BotMode = "polling" | "webhook";

export const TELEGRAM_BOT_TOKEN = env["TELEGRAM_BOT_TOKEN"] || "xyzXYZ";
export const TELEGRAM_BOT_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN!}`;
export const TELEGRAM_BOT_FILE_URL = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN!}`;
export const TELEGRAM_BOT_MODE: BotMode =
  (() => {
    const mode = env["TELEGRAM_BOT_MODE"];
    if (!!mode) {
      return mode as BotMode;
    }

    return null;
  })() || "polling";
export const TELEGRAM_WEBHOOK_DOMAIN =
  env["TELEGRAM_WEBHOOK_DOMAIN"] || "yourdomain.com";

export const TELEGRAM_WEBHOOK_PATH = env["TELEGRAM_WEBHOOK_PATH"] || "/bot";
