import mongo from "app/mongo";
import { queues } from "app/queues";
import * as storage from "app/storage";
import { BASE_URL } from "consts/core";
import { createLogger } from "core-kit/packages/logger";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { FatalError, NotFoundError } from "core-kit/types/errors";
import { dataUriToBuffer } from "data-uri-to-buffer";
import fs from "fs/promises";
import {
  BooleanData,
  FloatData,
  ImageData,
  ImagesData,
  IntegerData,
  JsonData,
  Launch,
  LaunchArtefact,
  LaunchData,
  LaunchState,
  OUTPUT_TYPES,
  OutputDataType,
  StringData,
  VideoData,
} from "models/launch";
import { plan } from "packages/nodes/plan-node";
import path from "path";
import sharp from "sharp";
import { PipelineIOType } from "types/pipeline";
import { Primitive } from "types/primitive";
import { ulid } from "ulid";
import { getFileInfo, withTempContext } from "utils/files";
import { InputValue, liveState } from "./live-state";
import { sid } from "utils/string";
import { getPoster } from "utils/video";
import { download, extFromMime } from "utils/web";

const logger = createLogger("utils/launch");

export async function run(
  {
    launchedBy,
    pipeline,
    launchRequest,
    environment,
    scope,
    options,
    project,
    parent,
    depth,
    comment,
  }: Partial<Launch>,
  // a preset id lets a caller record the launch before it starts
  { id: _id = sid() }: { id?: string } = {}
): Promise<Launch> {
  const outputs = new Map<string, LaunchArtefact>();
  if (pipeline.outputs) {
    for (const [key, { type, title, order }] of pipeline.outputs) {
      outputs.set(
        key,
        new LaunchArtefact({
          type,
          title,
          order,
        })
      );
    }
  }

  // set inputs for nodes
  const inputs: InputValue[] = [];
  for (const [id, node] of pipeline.nodes) {
    logger.debug(`Node ${id}`);
    if (node.inputs) {
      for (const [key, input] of node.inputs) {
        const value = launchRequest.nodes?.get(id)?.inputs?.get(key);
        if (value !== undefined) {
          inputs.push({ node: id, input: key, value });
        } else if (input.required && input.default !== undefined) {
          inputs.push({ node: id, input: key, value: input.default });
        }
      }
    }
  }

  // set nodes inputs from request pipeline inputs
  if (pipeline.inputs) {
    // convert launch requests inputs
    for (const [id, { type }] of pipeline.inputs) {
      const { inputs } = launchRequest;
      if (inputs.has(id)) {
        const value = inputs.get(id);
        switch (type) {
          case "image":
          case "video": {
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
          }
          default:
          //
        }
      }
    }

    // set inputs for nodes
    for (const [id, input] of pipeline.inputs) {
      const requestedValue = launchRequest.inputs?.get(id);
      const value =
        requestedValue === undefined ? input.default : requestedValue;
      if (value !== undefined) {
        if (input.flows) {
          for (const [, flow] of input.flows) {
            inputs.push({ node: flow.to, input: flow.input, value });
          }
        }
      }
    }
  }

  const now = new Date();
  const launch = new Launch({
    _id,
    launchedAt: now,
    // a scoped launch starts once run_launch lets it through
    startedAt: scope?.activated ? undefined : now,
    launchedBy,
    project,
    pipeline,
    launchRequest,
    environment,
    parent: parent || null,
    depth: depth || 0,
    scope,
    options,
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

  await liveState.create(launch, inputs);

  if (scope?.activated) {
    logger.debug(`Run pipeline in scope ${scope.id}`);
    await queues.launches.run.plan({ launch: launch._id, scope });
  } else {
    await kick(launch);
  }

  if (pipeline.inputs) {
    queues.launches.inputs.set.plan({ launch: _id }, { delay: 2000 });
  }

  return launch;
}

export async function kick(launch: Launch) {
  if (!launch.startedAt) {
    launch.startedAt = new Date();
    await liveState.started(launch);
  }

  const {
    pipeline,
    launchRequest: { inclusive },
  } = launch;

  for (const node of inclusive?.nodes || launch.pipeline.start.nodes) {
    await plan(node, pipeline.nodes.get(node), launch._id);
  }
}

// interrupts the launch and, recursively, every child launch it started
export async function interrupt(id: string): Promise<void> {
  await liveState.interrupt(id);
  const children = await mongo.launches.distinct("_id", { parent: id });
  for (const child of children) {
    await interrupt(child);
  }
}

export async function getPlain(id: string): Promise<object> {
  const plain = await liveState.getPlain(id);
  if (!plain) {
    throw new NotFoundError(`Launch ${id} is not found`);
  }
  return plain;
}

export async function get(id: string): Promise<Launch> {
  return toInstance(await getPlain(id), Launch);
}

export async function state(id: string): Promise<LaunchState> {
  const launch = await get(id);

  const { launchedAt, pipeline } = launch;

  const outputs = new Map<string, Primitive>();
  for (const [key, value] of await liveState.outputs(launch)) {
    switch (pipeline.outputs.get(key).type) {
      case "json":
        outputs.set(key, JSON.parse(value as string));
        break;
      default:
        outputs.set(key, value);
    }
  }

  const errors = await liveState.errors(id);
  return new LaunchState({ launchedAt, errors, outputs });
}

export async function data(id: string): Promise<LaunchData> {
  const launch = await get(id);

  const { launchedAt } = launch;

  const outputs = new Map<string, LaunchArtefact>();
  for (const [key, json] of await liveState.outputData(launch)) {
    outputs.set(
      key,
      toInstance(json, OUTPUT_TYPES[(json as { type: string }).type])
    );
  }

  const errors = await liveState.errors(id);
  return new LaunchData({ launchedAt, errors, outputs });
}

export async function getIOData(
  launch: string,
  bucket: "artefacts" | "outputs" | null,
  container: "inputs" | "outputs" | "nodes",
  id: string,
  type: PipelineIOType,
  value: Primitive
): Promise<OutputDataType> {
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
    case "string[]": {
      const values = (value as string).split("|");
      return new StringData({
        value: values.join(", "),
      });
    }
    case "json":
      return new JsonData({
        value: JSON.parse(value as string),
      });
    case "image": {
      const url = value as string;
      const { data } = await download(url);
      const { ext } = await getFileInfo(data);
      const fileName = `${launch}_${container}_${id}.${ext}`;

      const { width, height } = await sharp(data).metadata();
      return new ImageData({
        format: ext,
        url:
          storage.bucket(url) !== (bucket ?? null)
            ? await storage.output(data, fileName)
            : url,
        width,
        height,
      });
    }
    case "image[]": {
      const images = [];
      const urls = (value as string).split("|");
      let index = 0;
      for (const url of urls) {
        const { data } = await download(url);
        const { ext } = await getFileInfo(data);
        const fileName = `${launch}_${container}_${id}_${index++}.${ext}`;
        const { width, height } = await sharp(data).metadata();
        images.push(
          new ImageData({
            format: ext,
            url:
              storage.bucket(url) !== (bucket ?? null)
                ? await storage.output(data, fileName)
                : url,
            width,
            height,
          })
        );
      }
      return new ImagesData({
        images,
      });
    }
    case "video": {
      const url = value as string;
      const { data } = await download(url);
      const { ext } = await getFileInfo(data);
      const name = `${launch}_${container}_${id}`;
      const fileName = {
        video: `${name}.${ext}`,
        poster: `${name}_poster.jpg`,
      };

      let poster: Buffer;
      await withTempContext(async (tmpFolder) => {
        const filePath = path.join(tmpFolder, fileName.video);
        await fs.writeFile(filePath, new Uint8Array(data));
        poster = await getPoster(filePath);
      });

      const { width, height } = await sharp(poster).metadata();

      return new VideoData({
        url:
          storage.bucket(url) !== (bucket ?? null)
            ? await storage.output(data, fileName.video)
            : url,
        poster: await storage.output(poster, fileName.poster),
        width,
        height,
      });
    }
    default:
      throw new FatalError(`Unknown output type ${type}`);
  }
}
