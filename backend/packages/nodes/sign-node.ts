import { NODE_SIGN_SALT } from "consts/core";
import crypto from "crypto";

export function generateSign(script: string) {
  return crypto
    .createHash("sha256")
    .update([NODE_SIGN_SALT, script.replace(/\s+/g, "")].join("\n\n"))
    .digest("hex");
}
