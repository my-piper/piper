import api from "app/api";
import prettier from "prettier";
import { handle } from "utils/http";

api.post(
  "/api/utils/format-code",
  handle(() => async ({ body: code }) => {
    return await prettier.format(code, {
      parser: "babel",
    });
  })
);
