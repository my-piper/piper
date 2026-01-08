import api from "app/api";
import axios from "axios";
import env from "core-kit/env";
import { DataError } from "core-kit/types/errors";
import { handle } from "utils/http";

const FETCH_ALLOWED_URIS = env["FETCH_ALLOWED_URIS"]?.split(",") || [
  "https://cdn.jsdelivr.net/gh/my-piper",
];

api.get(
  "/api/utils/fetch",
  handle(() => async ({ query: { url } }) => {
    if (!url) {
      throw new DataError("URL is not provided");
    }

    const uri = url as string;
    if (!FETCH_ALLOWED_URIS.some((u) => uri.startsWith(u))) {
      throw new DataError("Access denied");
    }
    const { data } = await axios.get(uri, { responseType: "text" });
    return data;
  })
);
