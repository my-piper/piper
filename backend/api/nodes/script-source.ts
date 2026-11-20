import api from "app/api";
import axios from "axios";
import { DataError, NotFoundError } from "core-kit/types/errors";
import { getFile } from "packages/registry/files";
import { parseRegistryScript } from "packages/registry/reference";
import { checkEngineer, handle } from "utils/http";

api.post(
  "/api/nodes/script-source",
  handle(({ currentUser }) => async ({ body }) => {
    checkEngineer(currentUser);
    const { script } = body;
    if (typeof script !== "string") {
      throw new DataError("Script must be a string");
    }
    if (script.startsWith("registry:")) {
      const { nodePackage, version, path } = parseRegistryScript(script);
      const data = await getFile(nodePackage, version, path);
      if (!data) {
        throw new NotFoundError();
      }
      return { source: data.toString("utf-8") };
    }

    if (/^https?:\/\//.test(script)) {
      // Existing Pipelines and YAML imports may use custom Deno hosts or
      // unpinned URLs. Archive authoring restrictions do not apply to them.
      const { data } = await axios({
        url: script,
        responseType: "text",
        transformResponse: [(value) => value],
        timeout: 10000,
        maxContentLength: 2 * 1024 * 1024,
        maxRedirects: 0,
      });
      return { source: data };
    }
    return { source: script };
  })
);
