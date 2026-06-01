import env from "../../env";
import { Countries, Currencies, Languages } from "./enums";

export const ALL_LANGUAGES = [
  Languages.en,
  Languages.ru,
  Languages.de,
  Languages.es,
  Languages.ptBR,
  Languages.fr,
  Languages.ja,
  Languages.ko,
  Languages.zhCN,
  Languages.zhTW,
  Languages.hi,
  Languages.tr,
  Languages.it,
];
export const ALL_CURRENCIES = [
  Currencies.usd,
  Currencies.eur,
  Currencies.rub,
  Currencies.azn,
  Currencies.brl,
  Currencies.cop,
  Currencies.kzt,
  Currencies.mxn,
  Currencies.uzs,
  Currencies.ars,
  Currencies.bdt,
  Currencies.bob,
  Currencies.xaf,
  Currencies.cad,
  Currencies.clp,
  Currencies.cny,
  Currencies.crc,
  Currencies.xof,
  Currencies.svc,
  Currencies.ghs,
  Currencies.gtq,
  Currencies.hnl,
  Currencies.inr,
  Currencies.idr,
  Currencies.jpy,
  Currencies.kes,
  Currencies.myr,
  Currencies.nio,
  Currencies.ngn,
  Currencies.pen,
  Currencies.pyg,
  Currencies.php,
  Currencies.rwf,
  Currencies.sgd,
  Currencies.zar,
  Currencies.tzs,
  Currencies.thb,
  Currencies.ugx,
  Currencies.uyu,
  Currencies.vnd,
  Currencies.zmw,
];

export const DEFAULT_LANGUAGE = (() => {
  const language = (env["DEFAULT_LANGUAGE"] as Languages) || null;
  return !!language && ALL_LANGUAGES.includes(language)
    ? language
    : Languages.en;
})();

export const DEFAULT_COUNTRY = Countries.us;
export const DEFAULT_CURRENCY = (() => {
  const currency = (env["DEFAULT_CURRENCY"] as Currencies) || null;
  return !!currency && ALL_CURRENCIES.includes(currency)
    ? currency
    : Currencies.usd;
})();
