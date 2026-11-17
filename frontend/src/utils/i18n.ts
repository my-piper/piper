import { parse, stringify } from "qs";
import { Languages } from "src/enums/languages";

const SPLIT_REGEX = /---\s*(\w+)\s*---\s*\n/g;
const DELIMITER = ";";
type Labels = { en: string } & { [key in Languages]?: string };

export function createLabel(labels: { [key in Languages]?: string }) {
  return stringify(labels, { delimiter: DELIMITER, encode: false });
}

export function getLabels(source: string): Labels {
  const mode = SPLIT_REGEX.test(source) ? "multiline" : "inline";
  switch (mode) {
    case "multiline": {
      const chunks = source.split(SPLIT_REGEX);
      const [en] = chunks;
      const languages: Labels = { en };
      for (let i = 1; i < chunks.length; i += 2) {
        const [l, c] = [chunks[i], chunks[i + 1]];
        languages[l as Languages] = c;
      }
      return languages;
    }
    case "inline":
    default: {
      const languages = parse(source, { delimiter: DELIMITER }) as Labels;
      return "en" in languages ? languages : { en: source };
    }
  }
}

export function getLabel(source: string, language: Languages) {
  if (!source) {
    return null;
  }
  const languages = getLabels(source);
  return languages[language] || languages.en;
}
