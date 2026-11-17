import { customAlphabet } from "nanoid";

export function sid(length: number = 10): string {
  return customAlphabet("1234567890abcdef", length)();
}
