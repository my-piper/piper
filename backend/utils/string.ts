import { DEFAULT_LANGUAGE, Languages } from "core-kit/packages/locale";
import trim from "lodash/trim";
import { customAlphabet } from "nanoid";
import { parse } from "qs";

export function sid(length = 10): string {
  return customAlphabet("1234567890abcdef", length)();
}

export function i18n(source: string, language: Languages): string {
  const labels = parse(source, { delimiter: ";" });
  return trim(
    (labels[language] as string) ||
      (labels[DEFAULT_LANGUAGE] as string) ||
      source
  );
}
