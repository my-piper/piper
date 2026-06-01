import hb, { HelperOptions } from "handlebars";
import { Currencies } from "../locale";

hb.registerHelper("currency", function (value: number, currency: Currencies) {
  switch (currency) {
    case Currencies.rub:
      return `${value}₽`;
    case Currencies.eur:
      return `€${value}`;
    case Currencies.usd:
    default:
      return `$${value}`;
  }
});

hb.registerHelper("percent", function (value: number) {
  return `${value * 100}%`;
});

hb.registerHelper("json", function (data: any) {
  return JSON.stringify(data, null, 2);
});

hb.registerHelper("eq", function (a: any, b: any, options: HelperOptions) {
  return a === b ? options.fn(this) : options.inverse(this);
});

hb.registerHelper("ne", function (a: any, b: any, options: HelperOptions) {
  return a !== b ? options.fn(this) : options.inverse(this);
});

hb.registerHelper("gt", function (a: any, b: any, options: HelperOptions) {
  return a > b ? options.fn(this) : options.inverse(this);
});

hb.registerHelper("gte", function (a: any, b: any, options: HelperOptions) {
  return a >= b ? options.fn(this) : options.inverse(this);
});

hb.registerHelper("lt", function (a: any, b: any, options: HelperOptions) {
  return a < b ? options.fn(this) : options.inverse(this);
});

hb.registerHelper("lte", function (a: any, b: any, options: HelperOptions) {
  return a <= b ? options.fn(this) : options.inverse(this);
});

export default hb;
