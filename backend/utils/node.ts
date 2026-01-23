import * as storage from "app/storage";
import { plainToClass } from "class-transformer";
import { NODE_INPUT, NODE_STATUS } from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis from "core-kit/packages/redis";
import { DataError } from "core-kit/types/errors";
import { dataUriToBuffer } from "data-uri-to-buffer";
import { Launch } from "models/launch";
import { Node, NodeInput, NodeOutput, NodeStatus } from "models/node";
import { Pipeline } from "models/pipeline";
import { NodeInputs, NodeOutputs } from "types/node";
import { PipelineIOType } from "types/pipeline";
import { Primitive } from "types/primitive";
import { fromRedisValue } from "utils/redis";
import { isDataUri } from "./data-uri";
import { getFileInfo } from "./files";
import { sid } from "./string";
import { download, downloadBinary } from "./web";

const logger = createLogger("utils/node");

export function convertInput(value: Primitive, type: PipelineIOType) {
  switch (type) {
    case "boolean":
      return value as boolean;
    case "integer":
    case "float":
      return value as number;
    case "string":
      return value as string;
    case "json":
      return JSON.parse(value as string);
    case "image":
    case "archive":
    case "audio":
    case "video":
      return value as string;
    case "string[]":
    case "image[]":
    case "video[]":
      return (value as string).split("|");
    default:
      throw new Error(`Wrong input type ${type}`);
  }
}

export const convertInputs =
  ({ node, pipeline }: { node?: Node; pipeline?: Pipeline }) =>
  (inputs: { [key: string]: Primitive } | Map<string, Primitive>) => {
    const converted: NodeInputs = {};
    for (const [key, input] of pipeline?.inputs || node?.inputs) {
      const value = inputs instanceof Map ? inputs.get(key) : inputs[key];
      if (value !== undefined && value !== null) {
        try {
          converted[key] = convertInput(value, input.type);
        } catch (e) {
          throw new DataError(`Can't convert input [${key}]`, {
            input: key,
            value,
            type: input.type,
          });
        }
      }
    }
    return converted;
  };

export const getNodeInputs =
  ({ launch, node }: { launch: Launch; node: Node }) =>
  async (id: string): Promise<{ [key: string]: Primitive }> => {
    const inputs: { [key: string]: Primitive } = {};
    for (const [key, input] of node.inputs) {
      const value = await (async () => {
        const value = await redis.get(NODE_INPUT(launch._id, id, key));
        return value !== null ? fromRedisValue(input.type, value) : null;
      })();
      if (value !== null) {
        inputs[key] = value;
      }
    }
    return inputs;
  };

export const getNodeStatus =
  ({ launch }: { launch: Launch }) =>
  async (node: string): Promise<NodeStatus | null> => {
    const json = await redis.get(NODE_STATUS(launch._id, node));
    return !!json ? plainToClass(NodeStatus, JSON.parse(json) as Object) : null;
  };

export async function getBinary(url: string): Promise<Buffer> {
  return await downloadBinary(url);
}

export type InputsReadiness = {
  required: string[];
  filled: string[];
  ready: boolean;
};

export function checkInputs(
  inputs: { [key: string]: Primitive },
  config: Map<string, NodeInput>
): InputsReadiness {
  const required = [],
    filled = [];
  for (const [key, input] of config) {
    const value = inputs[key];
    if (input.required) {
      required.push(key);
      if (value !== undefined && value !== null) {
        filled.push(key);
      }
    }
  }
  return {
    filled,
    required,
    ready: filled.length >= required.length,
  };
}

export const convertOutputs =
  ({
    launch,
    node,
    bucket = null,
  }: {
    launch: Launch;
    node: string;
    bucket: "artefact" | "output" | null;
  }) =>
  async (
    outputs: NodeOutputs,
    config: Map<string, NodeOutput>
  ): Promise<{ [key: string]: Primitive }> => {
    const results: { [key: string]: Primitive } = {};
    for (const [key, output] of config) {
      const saveBinary = async (data: Buffer, fileName: string) => {
        const { ext } = await getFileInfo(data);

        const action = (() => {
          switch (bucket) {
            case "output":
              logger.debug("Save data to outputs");
              return storage.output;
            case "artefact":
            default:
              logger.debug("Save data to artefacts");
              return storage.artefact;
          }
        })();

        return await action(data, `${fileName}.${ext}`);
      };

      const saveUri = async (url: string) => {
        if (!bucket) {
          return url;
        }
        const { data } = await download(url);
        const fileName = [launch._id, node, key, sid(2)].join("_");
        return await saveBinary(data, fileName);
      };

      const value = outputs.get(key);
      if (value !== undefined) {
        if (value !== null) {
          switch (output.type) {
            case "boolean":
              results[key] = value as boolean;
              break;
            case "integer":
            case "float":
              results[key] = value as number;
              break;
            case "string":
              results[key] = value as string;
              break;
            case "string[]":
              results[key] = (value as string[]).join("|");
              break;
            case "json":
              results[key] = JSON.stringify(value, null, "  ");
              break;
            case "image":
            case "archive":
            case "audio":
            case "video": {
              if (typeof value === "string") {
                if (isDataUri(value)) {
                  // Handle data URI
                  const { buffer } = dataUriToBuffer(value);
                  const fileName = [launch._id, node, key, sid(2)].join("_");
                  results[key] = await saveBinary(
                    Buffer.from(buffer),
                    fileName
                  );
                } else {
                  // Regular URL string
                  results[key] = await saveUri(value as string);
                }
              } else {
                throw new Error(`Can't convert binary`);
              }
              break;
            }
            case "image[]": {
              const urls = [];
              let index = 0;
              for (const image of value as string[]) {
                if (typeof image === "string") {
                  if (isDataUri(image)) {
                    // Handle data URI
                    const { buffer } = dataUriToBuffer(image);
                    const fileName = [launch._id, node, key, index++].join("_");
                    urls.push(await saveBinary(Buffer.from(buffer), fileName));
                  } else {
                    // Regular URL string
                    urls.push(await saveUri(image));
                  }
                } else {
                  throw new Error(`Can't convert image`);
                }
              }
              results[key] = urls.join("|");
              break;
            }
            default:
              throw new Error(`Wrong output type ${output.type}`);
          }
        } else {
          results[key] = null;
        }
      }
    }
    return results;
  };
