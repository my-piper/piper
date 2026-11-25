import { InjectionToken } from "@angular/core";
import cookie from "cookiejs";
import { ALL_LANGUAGES } from "src/consts/locale";
import { Languages } from "src/enums/languages";

export const CURRENT_LANGUAGE = new InjectionToken<Languages>(
  "current_language",
);
export const LANGUAGE_KEY = "language";

export function currentLangFactory(baseHref: string) {
  {
    const language = cookie("language") as Languages;
    if (!!language && ALL_LANGUAGES.includes(language)) {
      return language;
    }
  }

  switch (baseHref) {
    case "/de/":
      return Languages.de;
    case "/es/":
      return Languages.es;
    case "/pt-BR/":
    case "/pt-br/":
      return Languages.ptBR;
    case "/fr/":
      return Languages.fr;
    case "/ja/":
      return Languages.ja;
    case "/ko/":
      return Languages.ko;
    case "/zh-CN/":
    case "/zh-cn/":
      return Languages.zhCN;
    case "/zh-TW/":
    case "/zh-tw/":
      return Languages.zhTW;
    case "/hi/":
      return Languages.hi;
    case "/tr/":
      return Languages.tr;
    case "/it/":
      return Languages.it;
    case "/en/":
    default:
      return Languages.en;
  }
}
