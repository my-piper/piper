import { InjectionToken } from "@angular/core";
import { Locale } from "date-fns";
import { Languages } from "src/enums/languages";

import {
  de,
  enUS,
  es,
  fr,
  hi,
  it,
  ko,
  ptBR,
  ru,
  tr,
  zhCN,
  zhTW,
} from "date-fns/locale";

export const DATE_LOCALE = new InjectionToken<Languages>("date_locale");

export function dateLocaleFactory(currentLang: Languages): Locale {
  switch (currentLang) {
    case Languages.ru:
      return ru;
    case Languages.de:
      return de;
    case Languages.es:
      return es;
    case Languages.ptBR:
      return ptBR;
    case Languages.fr:
      return fr;
    case Languages.ko:
      return ko;
    case Languages.zhCN:
      return zhCN;
    case Languages.zhTW:
      return zhTW;
    case Languages.hi:
      return hi;
    case Languages.tr:
      return tr;
    case Languages.it:
      return it;
    case Languages.en:
    default:
      return enUS;
  }
}
