import ajv from "app/ajv";
import mongo from "app/mongo";
import axios from "axios";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import assign from "lodash/assign";
import { LaunchRequest, NodeToLaunch } from "models/launch-request";
import { Pipeline } from "models/pipeline";
import { Project } from "models/project";
import { User } from "models/user";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import { Primitive } from "types/primitive";
import { ulid } from "ulid";
import { sid } from "utils/string";
import * as YAML from "yaml";
import { adoptNodes } from "./adopt-nodes";

// A line of six dashes between the Pipeline YAML and the Launch request JSON;
// pasted text may end there, or carry spaces and Windows line endings.
const SPLITTER = /\r?\n------[ \t]*(?:\r?\n|$)/;

// A parser's message quotes the text, which only the caller may see when it
// pasted the text itself rather than a URL.
function parse(message: string, read: () => unknown, quote: boolean): object {
  try {
    return read() as object;
  } catch (e) {
    throw new DataError(message, quote ? [(e as Error).message] : []);
  }
}

export async function importPipeline(user: User, source: string) {
  let yaml = source;
  const pasted = !/^http/.test(source);
  if (!pasted) {
    try {
      const { data } = await axios(source, {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      yaml = data;
    } catch {
      // the reason could tell what answers at an address the server can reach
      throw new DataError("Pipeline can't be loaded from the URL");
    }
  }

  const { pipeline, launchRequest } = await (async () => {
    const [chunk1, chunk2] = yaml.split(SPLITTER);

    const pipeline = parse(
      "Pipeline YAML is invalid",
      () => YAML.parse(chunk1),
      pasted
    );
    const validate = ajv.compile(SCHEMAS.pipeline);
    if (!validate(pipeline)) {
      const { errors } = validate;
      throw new DataError(
        "Pipeline schema invalid",
        errors.map((e) =>
          [
            e.propertyName || e.instancePath || e.schemaPath,
            e.message,
            JSON.stringify(e.params),
          ].join(": ")
        )
      );
    }

    const results: { pipeline: Pipeline; launchRequest?: LaunchRequest } = {
      pipeline: toInstance(pipeline, Pipeline),
      launchRequest: null,
    };

    if (chunk2?.trim()) {
      const launchRequest = parse(
        "Launch request JSON is invalid",
        () => JSON.parse(chunk2),
        pasted
      );
      const validate = ajv.compile(SCHEMAS.launchRequest);
      if (!validate(launchRequest)) {
        const { errors } = validate;
        throw new DataError(
          "Launch request schema invalid",
          errors.map((e) =>
            [
              e.propertyName || e.instancePath || e.schemaPath,
              e.message,
              JSON.stringify(e.params),
            ].join(": ")
          )
        );
      }
      assign(results, {
        launchRequest: toInstance(launchRequest, LaunchRequest),
      });
    }

    return results;
  })();

  const problems = await adoptNodes(pipeline);
  if (problems.length > 0) {
    throw new DataError("Pipeline can't be imported", problems);
  }

  const { name: title } = pipeline;

  const project = new Project({
    _id: sid(),
    revision: sid(),
    createdAt: new Date(),
    createdBy: (() => {
      const { _id } = user;
      return new User({ _id });
    })(),
    title,
    visibility: "private",
    pipeline,
    launchRequest:
      launchRequest ||
      new LaunchRequest({
        inputs: new Map<string, Primitive>(),
        nodes: new Map<string, NodeToLaunch>(),
      }),
    cursor: ulid(),
  });
  const plain = toPlain(project);
  await mongo.projects.insertOne(plain as { _id: string });

  const { version, description, thumbnail } = plain["pipeline"];
  plain["pipeline"] = { version, description, thumbnail };
  delete plain["launchRequest"];
  return plain;
}
