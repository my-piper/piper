import api from "app/api";
import { ALL_LANGUAGES } from "core-kit/packages/locale";
import { escapeRegExp } from "lodash";
import { LANGUAGE_COOKIE } from "utils/http";

// Piper is built in English only, but core-kit's language list still matches
// the other locale prefixes: their old links open the same page in English
// instead of a missing build, and a remembered language other than English is
// forgotten so it stops sending people here.
const DROPPED_LANGUAGES = ALL_LANGUAGES.filter((language) => language !== "en");
const DROPPED_PREFIX = new RegExp(
  `^/(${DROPPED_LANGUAGES.map(escapeRegExp).join("|")})(?=/|\\?|$)`,
  "i"
);

api.get(DROPPED_PREFIX, (req, res) => {
  const remembered = req.cookies?.[LANGUAGE_COOKIE];
  if (remembered && remembered !== "en") {
    res.clearCookie(LANGUAGE_COOKIE, { path: "/" });
  }
  res.redirect(301, req.originalUrl.replace(DROPPED_PREFIX, "/en"));
});
