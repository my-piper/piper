import mongo from "app/mongo";
import { queues } from "app/queues";
import * as storage from "app/storage";
import { BILLING_ACTIVE } from "consts/billing";
import { BASE_URL } from "consts/core";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  NODE_INPUT,
  PIPELINE_ERRORS,
  PIPELINE_OUTPUT,
  PIPELINE_OUTPUT_DATA,
} from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { FatalError, NotFoundError } from "core-kit/types/errors";
import { dataUriToBuffer } from "data-uri-to-buffer";
import { fileTypeFromBuffer } from "file-type";
import fs from "fs/promises";
import {
  BooleanData,
  FloatData,
  ImageData,
  ImagesData,
  IntegerData,
  JsonData,
  Launch,
  LaunchData,
  LaunchOutput,
  LaunchState,
  OUTPUT_TYPES,
  StringData,
  VideoData,
} from "models/launch";
import { plan } from "packages/nodes/plan-node";
import { getCosts } from "packages/pipelines/pipeline-costs";
import path from "path";
import sharp from "sharp";
import { PipelineIOType } from "types/pipeline";
import { Primitive } from "types/primitive";
import { ulid } from "ulid";
import { withTempContext } from "utils/files";
import { fromRedisValue, toRedisValue } from "utils/redis";
import { sid } from "utils/string";
import { getPoster } from "utils/video";
import { downloadBinary, extFromMime } from "utils/web";

const logger = createLogger("utils/launch");

export async function run({
  launchedBy,
  pipeline,
  launchRequest,
  environment,
  scope,
  options,
  project,
  parent,
  comment,
}: Partial<Launch>): Promise<Launch> {
  const outputs = new Map<string, LaunchOutput>();
  if (!!pipeline.outputs) {
    for (const [key, { type, title, order }] of pipeline.outputs) {
      outputs.set(
        key,
        new LaunchOutput({
          type,
          title,
          order,
        })
      );
    }
  }

  const _id = sid();

  // set inputs for nodes
  for (const [id, node] of pipeline.nodes) {
    logger.debug(`Node ${id}`);
    for (const [key, input] of node.inputs) {
      const save = (value: Primitive) =>
        redis.setEx(
          NODE_INPUT(_id, id, key),
          LAUNCH_EXPIRED,
          toRedisValue(input.type, value)
        );
      const value = launchRequest.nodes?.get(id)?.inputs?.get(key);
      if (value !== undefined) {
        await save(value);
      } else if (input.required && input.default !== undefined) {
        await save(input.default);
      }
    }
  }

  // set nodes inputs from request pipeline inputs
  if (!!pipeline.inputs) {
    // convert launch requests inputs
    for (const [id, { type }] of pipeline.inputs) {
      const { inputs } = launchRequest;
      if (inputs.has(id)) {
        const value = inputs.get(id);
        switch (type) {
          case "image":
          case "video":
            const url = value as string;
            if (url?.startsWith("data")) {
              const { typeFull, buffer } = dataUriToBuffer(url);
              const fileName = [sid(), extFromMime(typeFull)].join(".");
              inputs.set(
                id,
                await storage.artefact(Buffer.from(buffer), fileName)
              );
            }
            break;
          default:
          //
        }
      }
    }

    // set inputs for nodes
    for (const [id, input] of pipeline.inputs) {
      let value = launchRequest.inputs?.get(id) || input.default;
      if (value !== undefined) {
        if (!!input.flows) {
          for (const [, flow] of input.flows) {
            const to = pipeline.nodes.get(flow.to).inputs.get(flow.input);
            await redis.setEx(
              NODE_INPUT(_id, flow.to, flow.input),
              LAUNCH_EXPIRED,
              toRedisValue(to.type, value)
            );
          }
        }
      }
    }
  }

  const costs = BILLING_ACTIVE ? await getCosts(pipeline, launchRequest) : null;

  const now = new Date();
  const launch = new Launch({
    _id,
    launchedAt: now,
    launchedBy,
    project,
    pipeline,
    launchRequest,
    environment,
    parent: parent || null,
    scope,
    options,
    costs,
    comment,
    url: `${BASE_URL}/launches/${_id}`,
    outputs,
    cursor: ulid(),
  });

  await mongo.launches.insertOne(
    (() => {
      const plain = toPlain(launch);
      delete plain["pipeline"];
      delete plain["request"];
      return plain;
    })() as { _id: string }
  );

  await redis.setEx(
    LAUNCH(launch._id),
    LAUNCH_EXPIRED,
    JSON.stringify(toPlain(launch))
  );

  if (scope?.activated) {
    logger.debug(`Run pipeline in scope ${scope.id}`);
    await redis.rPush(scope.id, launch._id);
    await queues.launches.run.plan({ launch: launch._id, scope });
  } else {
    await kick(launch);
  }

  if (!!pipeline.inputs) {
    queues.launches.inputs.set.plan({ launch: _id }, { delay: 2000 });
  }

  return launch;
}

export async function kick(launch: Launch) {
  const { pipeline } = launch;
  for (const node of launch.pipeline.start.nodes) {
    await plan(node, pipeline.nodes.get(node), launch._id);
  }
}

export async function getPlain(id: string): Promise<Object> {
  const json = await redis.get(LAUNCH(id));
  if (!json) {
    throw new NotFoundError(`Launch ${id} is not found`);
  }
  return JSON.parse(json) as Object;
}

export async function get(id: string): Promise<Launch> {
  return toInstance(getPlain(id), Launch);
}

export async function state(id: string): Promise<LaunchState> {
  const launch = await get(id);

  const { launchedAt, pipeline } = launch;

  const outputs = new Map<string, Primitive>();

  if (!!pipeline.outputs) {
    for (const [key, output] of pipeline.outputs) {
      const value = await redis.get(PIPELINE_OUTPUT(launch._id, key));
      if (value !== null) {
        const primitive = fromRedisValue(output.type, value);
        const convert = () => {
          switch (output.type) {
            case "json":
              return JSON.parse(primitive as string);
            default:
              return primitive;
          }
        };

        outputs.set(key, convert());
      }
    }
  }

  const errors = (await redis.lRange(PIPELINE_ERRORS(id), 0, -1)) || [];
  return new LaunchState({ launchedAt, errors, outputs });
}

export async function data(id: string): Promise<LaunchData> {
  const launch = await get(id);

  const { launchedAt, pipeline } = launch;

  const outputs = new Map<string, LaunchOutput>();

  if (!!pipeline.outputs) {
    for (const [key, output] of pipeline.outputs) {
      const value = await redis.get(PIPELINE_OUTPUT_DATA(launch._id, key));
      if (value !== null) {
        const json = JSON.parse(value);
        outputs.set(key, toInstance(json, OUTPUT_TYPES[json["type"]]));
      }
    }
  }

  const errors = (await redis.lRange(PIPELINE_ERRORS(id), 0, -1)) || [];
  return new LaunchData({ launchedAt, errors, outputs });
}

export async function getIOData(
  launch: string,
  container: "inputs" | "outputs",
  id: string,
  type: PipelineIOType,
  value: Primitive
) {
  switch (type) {
    case "boolean":
      return new BooleanData({
        value: value as boolean,
      });
    case "integer":
      return new IntegerData({
        value: value as number,
      });
    case "float":
      return new FloatData({
        value: value as number,
      });
    case "string":
      return new StringData({
        value: value as string,
      });
    case "string[]":
      const values = (value as string).split("|");
      return new StringData({
        value: values.join(", "),
      });
    case "json":
      return new JsonData({
        value: JSON.parse(value as string),
      });
    case "image":
      const url = value as string;
      const data = await downloadBinary(url);
      const { ext } = await fileTypeFromBuffer(data);
      const fileName = `${launch}_${container}_${id}.${ext}`;

      const { width, height } = await sharp(data).metadata();
      return new ImageData({
        format: ext,
        url: await storage.output(data, fileName),
        width,
        height,
      });
    case "image[]":
      const images = [];
      const urls = (value as string).split("|");
      let index = 0;
      for (const url of urls) {
        const data = await downloadBinary(url);
        const { ext } = await fileTypeFromBuffer(data);
        const fileName = `${launch}_${container}_${id}_${index++}.${ext}`;
        const { width, height } = await sharp(data).metadata();
        images.push(
          new ImageData({
            format: ext,
            url: await storage.output(data, fileName),
            width,
            height,
          })
        );
      }
      return new ImagesData({
        images,
      });
    case "video": {
      const url = value as string;
      const video = await downloadBinary(url);
      const { ext } = await fileTypeFromBuffer(video);
      const name = `${launch}_${container}_${id}`;
      const fileName = {
        video: `${name}.${ext}`,
        poster: `${name}_poster.jpg`,
      };

      let poster: Buffer;
      await withTempContext(async (tmpFolder) => {
        const filePath = path.join(tmpFolder, fileName.video);
        await fs.writeFile(filePath, video);
        poster = await getPoster(filePath);
      });

      const { width, height } = await sharp(poster).metadata();

      return new VideoData({
        url: await storage.output(video, fileName.video),
        poster: await storage.output(poster, fileName.poster),
        width,
        height,
      });
    }
    default:
      throw new FatalError(`Unknown output type ${type}`);
  }
}
