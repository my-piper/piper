import { Expose, plainToInstance, Transform, Type } from "class-transformer";
import { NodeProgress } from "models/node";
import { mapTransformer, objectTransformer } from "transformers/object";
import { Primitive } from "./primitive";

export type InputOptions = {
  required?: boolean;
};

export type OutputOptions = {};

export class RepeatNode {
  @Expose()
  @Transform(objectTransformer)
  state: object;

  @Expose()
  @Type(() => NodeProgress)
  progress?: NodeProgress;

  @Expose()
  @Type(() => Number)
  delay?: number;

  static from(obj: object) {
    return plainToInstance(RepeatNode, obj, {
      excludeExtraneousValues: false,
      exposeUnsetFields: false,
    });
  }
}

export class ResetInputs {
  @Expose()
  @Type(() => String)
  inputs: string[];
}

export type NodeInputs = {
  [key: string]: Primitive | object;
};

export type NodeOutputs = Map<
  string,
  boolean | number | string | string[] | Buffer | Buffer[]
>;

export class NextNode {
  @Expose()
  @Type(() => ResetInputs)
  reset!: ResetInputs;

  @Type(() => String)
  behavior: "normal" | "loop" = "normal";

  @Type(() => String)
  kicks: [];

  @Transform(mapTransformer<Primitive | Buffer>)
  outputs: NodeOutputs;

  @Type(() => Number)
  delay: number = 1000;

  @Type(() => Number)
  costs!: number;

  static from(obj: object) {
    return plainToInstance(NextNode, obj, {
      excludeExtraneousValues: false,
      exposeUnsetFields: false,
    });
  }
}

export function Input(options: InputOptions = {}): PropertyDecorator {
  return function (target: any, propertyKey: string | symbol) {
    Reflect.defineMetadata("input", options, target, propertyKey);
  };
}

export function Output(options: OutputOptions = {}): PropertyDecorator {
  return function (target: any, propertyKey: string | symbol) {
    Reflect.defineMetadata("output", options, target, propertyKey);
  };
}

export type NodeReadiness = {
  inputs: {
    filled: string[];
  };
  ready: boolean;
};

export enum NodeJobResult {
  NODE_HAS_BEEN_PROCESSED_ALREADY = "NODE_HAS_BEEN_PROCESSED_ALREADY",
  LAUNCH_NOT_FOUND = "LAUNCH_NOT_FOUND",
  NODE_NOT_FOUND_IN_WORKFLOW = "NODE_NOT_FOUND_IN_WORKFLOW",
  NODE_INPUTS_NOT_READY_YET = "NODE_INPUTS_NOT_READY_YET",
  NODE_FLOWS_NOT_READY_YET = "NODE_FLOWS_NOT_READY_YET",
  HANDLER_FOR_NODE_WAS_NOT_DEFINED = "HANDLER_FOR_NODE_WAS_NOT_DEFINED",
  NODE_IS_PROCESSING_NOW_ALREADY = "NODE_IS_PROCESSING_NOW_ALREADY",
  NODE_IS_GOING_TO_REPEAT = "NODE_IS_GOING_TO_REPEAT",
  NODE_PROCESSED = "NODE_PROCESSED",
}
