import axios from "axios";
import { TELEGRAM_BOT_API_URL, TELEGRAM_BOT_FILE_URL } from "./consts";

export async function fileUrl(id: string) {
  const {
    data: {
      result: { file_path },
    },
  } = await axios(`${TELEGRAM_BOT_API_URL}/getFile?file_id=${id}`);
  return `${TELEGRAM_BOT_FILE_URL}/${file_path}`;
}

export function progressMessage(current: number, total: number = 100): string {
  if (current === -1) {
    [current, total] = [100, 100];
  }

  const MAX_LENGTH = 10;

  const percent = Math.ceil((current / total) * 100);
  const position = Math.ceil((current / total) * MAX_LENGTH);

  const filled = "█".repeat(position);
  const empty = "░".repeat(MAX_LENGTH - position);
  return `${filled}${empty} ${percent}%`;
}
