import trim from "lodash/trim";
import { parse } from "qs";
import { ALL_LANGUAGES, DEFAULT_LANGUAGE, Languages } from "../locale";
import i18n from "./i18n";

export type Labels = { [DEFAULT_LANGUAGE]: string } & {
  [key in Languages]?: string;
};

export function allLabels(source: string): Labels {
  const labels = parse(source, { delimiter: ";" });
  if (DEFAULT_LANGUAGE in labels) {
    return labels as Labels;
  }
  return { [DEFAULT_LANGUAGE]: source };
}

export function getLabel(source: string, language: Languages): string {
  const labels = allLabels(source);
  return trim(labels[language] || labels[DEFAULT_LANGUAGE]);
}

export function detect(code: string): Languages {
  const language = code as Languages;
  return ALL_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

const i18ns = new Map<string, typeof i18n>();

export async function i18nInstance(language: Languages) {
  if (i18ns.has(language)) {
    return i18ns.get(language);
  }
  const instance = i18n.cloneInstance({ lng: language });
  await instance.changeLanguage(language);
  i18ns.set(language, instance);
  return instance;
}
