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

const SPLITTER = /\n------\n/;

export async function importPipeline(user: User, source: string) {
  let yaml = source;
  if (/^http/.test(source)) {
    const { data } = await axios(source, {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    yaml = data;
  }

  const { pipeline, launchRequest } = await (async () => {
    const [chunk1, chunk2] = yaml.split(SPLITTER);

    const pipeline = YAML.parse(chunk1) as object;
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

    if (!!chunk2) {
      const launchRequest = JSON.parse(chunk2) as object;
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
