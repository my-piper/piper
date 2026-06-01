import * as marked from "marked";
import { Languages } from "../locale/enums";
import hb from "./handlebars";
const { compile } = hb;

const SPLIT_REGEX = /---\s*(\w+)\s*---\s*\n/g;

function i18n(text: string, language: Languages): string {
  const chunks = text.split(SPLIT_REGEX);
  const en = chunks[0];

  const languages: { [key: string]: string } = {};
  for (let i = 1; i < chunks.length; i += 2) {
    const [l, c] = [chunks[i], chunks[i + 1]];
    languages[l] = c;
  }

  return languages[language as string] || en;
}

export function markdown(content: string, language: Languages): string {
  return marked.parse(i18n(content, language)) as string;
}

export function handlebars(template: string, data: object): string {
  return compile(template)(data);
}
