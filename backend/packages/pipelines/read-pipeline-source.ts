import ajv from "app/ajv";
import axios from "axios";
import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { LaunchRequest } from "models/launch-request";
import { Pipeline } from "models/pipeline";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import * as YAML from "yaml";

// A line of six dashes between the Pipeline YAML and the Launch request JSON;
// pasted text may end there, or carry spaces and Windows line endings.
const SPLITTER = /\r?\n------[ \t]*(?:\r?\n|$)/;

export type PipelineSource = {
  pipeline: Pipeline;
  launchRequest: LaunchRequest | null;
};

// A parser's message quotes the text, which only the caller may see when it
// pasted the text itself rather than a URL.
function parse(message: string, read: () => unknown, quote: boolean): object {
  try {
    return read() as object;
  } catch (e) {
    throw new DataError(message, quote ? [(e as Error).message] : []);
  }
}

function checkSchema(message: string, schema: object, document: object): void {
  const validate = ajv.compile(schema);
  if (!validate(document)) {
    throw new DataError(
      message,
      validate.errors.map((e) =>
        [
          e.propertyName || e.instancePath || e.schemaPath,
          e.message,
          JSON.stringify(e.params),
        ].join(": ")
      )
    );
  }
}

async function load(url: string): Promise<string> {
  try {
    const { data } = await axios(url, {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    return data;
  } catch {
    // the reason could tell what answers at an address the server can reach
    throw new DataError("Pipeline can't be loaded from the URL");
  }
}

/**
 * Reads what an import was given: a Pipeline as YAML, or a URL to one,
 * optionally followed by a `------` line and its Launch request as JSON. Each
 * part must pass its schema.
 */
export async function readPipelineSource(
  source: string
): Promise<PipelineSource> {
  const pasted = !/^http/.test(source);
  const text = pasted ? source : await load(source);
  const [yaml, json] = text.split(SPLITTER);

  const pipeline = parse(
    "Pipeline YAML is invalid",
    () => YAML.parse(yaml),
    pasted
  );
  checkSchema("Pipeline schema invalid", SCHEMAS.pipeline, pipeline);

  if (!json?.trim()) {
    return { pipeline: toInstance(pipeline, Pipeline), launchRequest: null };
  }

  const launchRequest = parse(
    "Launch request JSON is invalid",
    () => JSON.parse(json),
    pasted
  );
  checkSchema(
    "Launch request schema invalid",
    SCHEMAS.launchRequest,
    launchRequest
  );
  return {
    pipeline: toInstance(pipeline, Pipeline),
    launchRequest: toInstance(launchRequest, LaunchRequest),
  };
}
