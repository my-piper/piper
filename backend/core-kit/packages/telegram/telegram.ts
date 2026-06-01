import { Telegraf } from "telegraf";
import { createLogger } from "../logger";
import { TELEGRAM_BOT_TOKEN } from "./consts";

const logger = createLogger("telegram");

logger.info(`Create bot with token ${TELEGRAM_BOT_TOKEN}`);
export default new Telegraf(TELEGRAM_BOT_TOKEN);
