import { Languages } from "core-kit/enums/languages";
import trim from "lodash/trim";
import { customAlphabet } from "nanoid";
import { parse } from "qs";
import { DEFAULT_LANG } from "../consts/core";

export function sid(length = 10): string {
  return customAlphabet("1234567890abcdef", length)();
}

export function i18n(source: string, language: Languages): string {
  const labels = parse(source, { delimiter: ";" });
  return trim(
    (labels[language] as string) || (labels[DEFAULT_LANG] as string) || source
  );
}
