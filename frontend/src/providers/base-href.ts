export const BASE_URL = "base_url";
import parse from "url-parse";

export function baseHrefFactory(document: Document) {
  const url = parse(document.baseURI);
  return url.pathname;
}
