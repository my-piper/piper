import axios from "axios";
import env from "core-kit/env";

export const ALLOW_SIGNUP = env["ALLOW_SIGNUP"] === "yes";
export const GOOGLE_AUTH = env["GOOGLE_AUTH"] === "yes";
export const YANDEX_AUTH = env["YANDEX_AUTH"] === "yes";

export const APP_FOOTER =
  (await (async () => {
    const footer = env["APP_FOOTER"];
    if (!!footer) {
      if (/^http/.test(footer)) {
        const { data } = await axios(footer);
        return data;
      }
      return footer;
    }
    return null;
  })()) || "<div>Pipelines builder 2025</div>";
