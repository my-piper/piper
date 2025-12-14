import * as storage from "app/storage";
import { plainToClass } from "class-transformer";
import { NODE_INPUT, NODE_STATUS } from "consts/redis";
import redis from "core-kit/packages/redis";
import { Launch } from "models/launch";
import { Node, NodeInput, NodeOutput, NodeStatus } from "models/node";
import { Pipeline } from "models/pipeline";
import { NodeInputs, NodeOutputs } from "types/node";
import { PipelineIOType } from "types/pipeline";
import { Primitive } from "types/primitive";
import { fromRedisValue } from "utils/redis";
import { getFileInfo } from "./files";
import { sid } from "./string";
import { downloadBinary } from "./web";

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
        converted[key] = convertInput(value, input.type);
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
  ({ launch, node }: { launch: Launch; node: string }) =>
  async (
    outputs: NodeOutputs,
    config: Map<string, NodeOutput>
  ): Promise<{ [key: string]: Primitive }> => {
    const results: { [key: string]: Primitive } = {};
    for (const [key, output] of config) {
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
              results[key] = JSON.stringify(value, null, "    ");
              break;
            case "image":
            case "archive":
            case "audio":
            case "video": {
              if (typeof value === "object") {
                const buffer = value as Buffer;
                const fileName = [launch._id, node, key, sid(2)].join("_");
                const { ext } = await getFileInfo(buffer);
                results[key] = await storage.artefact(
                  buffer,
                  `${fileName}.${ext}`
                );
              } else if (typeof value === "string") {
                results[key] = value;
              } else {
                throw new Error(`Can't convert binary`);
              }
              break;
            }
            case "image[]": {
              const urls = [];
              let index = 0;
              type expect = Buffer | string;
              for (const image of value as expect[]) {
                if (typeof image === "object") {
                  const buffer = image as Buffer;
                  const fileName = [launch._id, node, key, index++].join("_");
                  const { ext } = await getFileInfo(buffer);
                  urls.push(
                    await storage.artefact(buffer, `${fileName}.${ext}`)
                  );
                } else if (typeof image === "string") {
                  urls.push(image);
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
