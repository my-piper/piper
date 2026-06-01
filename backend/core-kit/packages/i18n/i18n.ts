import { readFileSync } from "fs";
import i18next, { BackendModule, ReadCallback } from "i18next";
import path from "path";
import { ALL_LANGUAGES, DEFAULT_LANGUAGE } from "../locale/consts";
import { createLogger } from "../logger";
import hb from "../templates/handlebars";

const logger = createLogger("i18n");
logger.level = "info";

const FILE_REF_PATTERN = "@file:";
const FILE_LOADER = "file-loader";

class LabelsLoader implements BackendModule {
  type: "backend" = "backend";

  init(services: any, backendOptions: any, i18nextOptions: any) {
    // optional: save config or i18n instance
  }

  read(language: string, namespace: string, callback: ReadCallback) {
    const filePath = path.join("locales", `${language}.json`);
    logger.debug(`Load locale ${filePath}`);

    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      callback(null, parsed);
    } catch (err) {
      callback(err, false);
    }
  }

  create() {}
}

const i18n = i18next.createInstance();
i18n.use(new LabelsLoader());
i18n.use({
  name: FILE_LOADER,
  type: "postProcessor",
  async: false,
  process: (value: string, key: string, options: any, translator: any) => {
    logger.debug(`Resolve key ${key} with value ${value}`);
    if (typeof value === "string" && value.startsWith(FILE_REF_PATTERN)) {
      const fileName = value.replace(FILE_REF_PATTERN, "").trim();
      const filePath = path.join("locales", fileName);
      logger.debug(`Read text from file ${filePath}`);
      try {
        const content = readFileSync(filePath, "utf-8");
        return hb.compile(content)(options);
      } catch (err) {
        logger.error(err);
        logger.warn("Failed to load file for key");
      }
    }

    return value;
  },
});
i18n.init({
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  preload: ALL_LANGUAGES,
  backend: {},
  interpolation: {
    escapeValue: false,
  },
  postProcess: [FILE_LOADER],
});

logger.info("Initialized");

export default i18n;
