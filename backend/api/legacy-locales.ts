import api from "app/api";
import { LANGUAGE_COOKIE } from "utils/http";

// Russian is no longer built, but core-kit's language list still matches
// /ru/: old links open the same page in English instead of a missing build,
// and a remembered Russian choice is forgotten so it stops sending people here.
api.get(["/ru", "/ru/*"], (req, res) => {
  if (req.cookies?.[LANGUAGE_COOKIE] === "ru") {
    res.clearCookie(LANGUAGE_COOKIE, { path: "/" });
  }
  res.redirect(301, req.originalUrl.replace(/^\/ru(?=\/|\?|$)/, "/en"));
});
