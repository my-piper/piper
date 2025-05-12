import { dereference } from "@apidevtools/json-schema-ref-parser";
import { readFile } from "fs/promises";
import path from "path";
import { CustomJSONSchema7 } from "types/json-schema";

export async function loadSchema(schema: Object): Promise<CustomJSONSchema7> {
  return dereference(schema as CustomJSONSchema7, {
    resolve: {
      local: {
        order: 1,
        canRead: /^local/i,
        read: async ({ url }) => {
          const filePath = path.join(
            process.cwd(),
            "schemas",
            url.replace(/^local\:\/\//, "")
          );
          return JSON.parse(await readFile(filePath, "utf-8"));
        },
      },
    },
  });
}
