import { createCipheriv, createDecipheriv, createHash } from "crypto";

const CRYPTO_ALGORITHM = "aes-256-ecb";

export function encrypt(text: string, key: string): string {
  const CRYPTO_KEY = createHash("sha256").update(key).digest();

  const cipher = createCipheriv(CRYPTO_ALGORITHM, CRYPTO_KEY, null);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

export function decrypt(encrypted: string, key: string): string {
  const CRYPTO_KEY = createHash("sha256").update(key).digest();

  const decipher = createDecipheriv(CRYPTO_ALGORITHM, CRYPTO_KEY, null);
  let text = decipher.update(encrypted, "hex", "utf8");
  text += decipher.final("utf8");
  return text;
}
