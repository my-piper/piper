import * as crypto from "crypto";
import { customAlphabet } from "nanoid";

export function sid(length = 10): string {
  return customAlphabet("1234567890abcdef", length)();
}

export function getHash(source: string) {
  return crypto.createHash("md5").update(source).digest("hex");
}
