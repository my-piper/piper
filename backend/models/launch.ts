import { Expose, Transform, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { Pipeline, PipelineCosts } from "models/pipeline";
import {
  multipleMapTransformer,
  objectsMapTransformer,
} from "transformers/map";
import { objectTransformer } from "transformers/object";
import { primitiveMapTransformer } from "transformers/primitive";
import { PipelineIOType } from "types/pipeline";
import { PrimitiveMap } from "types/primitive";
import { Environment } from "./environment";
import { LaunchRequest } from "./launch-request";
import { Project } from "./project";
import { RunScope } from "./run-scope";
import { User } from "./user";

export class LaunchOptions {
  @Expose()
  @Type(() => Boolean)
  notify: boolean;

  constructor(defs: Partial<LaunchOptions> = {}) {
    assign(this, defs);
  }
}

export abstract class OutputData {}

export class BooleanData extends OutputData {
  @Expose()
  @Type(() => Boolean)
  value: boolean;

  constructor(defs: Partial<BooleanData> = {}) {
    super();
    assign(this, defs);
  }
}

export class IntegerData extends OutputData {
  @Expose()
  @Type(() => Number)
  value: number;

  constructor(defs: Partial<IntegerData> = {}) {
    super();
    assign(this, defs);
  }
}

export class FloatData extends OutputData {
  @Expose()
  @Type(() => Number)
  value: number;

  constructor(defs: Partial<FloatData> = {}) {
    super();
    assign(this, defs);
  }
}

export class StringData extends OutputData {
  @Expose()
  @Type(() => String)
  value: string;

  @Expose()
  @Type(() => Number)
  length: number;

  constructor(defs: Partial<StringData> = {}) {
    super();
    assign(this, defs);
  }
}

export class JsonData extends OutputData {
  @Expose()
  @Transform(objectTransformer)
  value: object;

  constructor(defs: Partial<JsonData> = {}) {
    super();
    assign(this, defs);
  }
}

export class ImageData extends OutputData {
  @Expose()
  @Type(() => String)
  format: string;

  @Expose()
  @Type(() => String)
  url: string;

  @Expose()
  @Type(() => Number)
  width: number;

  @Expose()
  @Type(() => Number)
  height: number;

  constructor(defs: Partial<ImageData> = {}) {
    super();
    assign(this, defs);
  }
}

export class ImagesData extends OutputData {
  @Expose()
  @Type(() => ImageData)
  images: ImageData[];

  @Expose()
  @Type(() => Number)
  count: number;

  constructor(defs: Partial<ImagesData> = {}) {
    super();
    assign(this, defs);
  }
}

export class VideoData extends OutputData {
  @Expose()
  @Type(() => String)
  format: string;

  @Expose()
  @Type(() => String)
  url: string;

  @Expose()
  @Type(() => String)
  poster: string;

  @Expose()
  @Type(() => Number)
  width: number;

  @Expose()
  @Type(() => Number)
  height: number;

  constructor(defs: Partial<VideoData> = {}) {
    super();
    assign(this, defs);
  }
}

export const OUTPUT_TYPES = {
  boolean: BooleanData,
  integer: IntegerData,
  float: FloatData,
  string: StringData,
  json: JsonData,
  image: ImageData,
  "image[]": ImagesData,
  video: VideoData,
};

export class LaunchInput {
  @Expose()
  @Type(() => String)
  type?: PipelineIOType;

  @Expose()
  @Type(() => String)
  title?: string;

  @Expose()
  @Type(() => Number)
  order?: number;

  @Expose()
  @Type(() => OutputData, {
    discriminator: {
      property: "type",
      subTypes: [
        { value: BooleanData, name: "boolean" },
        { value: IntegerData, name: "integer" },
        { value: FloatData, name: "float" },
        { value: StringData, name: "string" },
        { value: JsonData, name: "json" },
        { value: ImageData, name: "image" },
        { value: ImagesData, name: "image[]" },
        { value: VideoData, name: "video" },
      ],
    },
  })
  data?:
    | BooleanData
    | IntegerData
    | FloatData
    | StringData
    | JsonData
    | ImageData
    | ImagesData
    | VideoData;

  constructor(defs: Partial<LaunchInput> = {}) {
    assign(this, defs);
  }
}

export class LaunchOutput {
  @Expose()
  @Type(() => String)
  _id?: string;

  @Expose()
  @Type(() => String)
  launch?: string;

  @Expose()
  @Type(() => Date)
  filledAt: Date;

  @Expose()
  @Type(() => User)
  launchedBy: User;

  @Expose()
  @Type(() => String)
  type?: PipelineIOType;

  @Expose()
  @Type(() => String)
  title?: string;

  @Expose()
  @Type(() => Number)
  order?: number;

  @Expose()
  @Type(() => OutputData, {
    discriminator: {
      property: "type",
      subTypes: [
        { value: BooleanData, name: "boolean" },
        { value: IntegerData, name: "integer" },
        { value: FloatData, name: "float" },
        { value: StringData, name: "string" },
        { value: JsonData, name: "json" },
        { value: ImageData, name: "image" },
        { value: ImagesData, name: "image[]" },
        { value: VideoData, name: "video" },
      ],
    },
  })
  data?:
    | BooleanData
    | IntegerData
    | FloatData
    | StringData
    | JsonData
    | ImageData
    | ImagesData
    | VideoData;

  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<LaunchOutput> = {}) {
    assign(this, defs);
  }
}

export class Launch {
  @Expose()
  @Type(() => String)
  _id: string;

  @Expose()
  @Type(() => Date)
  launchedAt: Date;

  @Expose()
  @Type(() => User)
  launchedBy: User;

  @Expose()
  @Type(() => Date)
  startedAt: Date;

  @Expose()
  @Type(() => Pipeline)
  pipeline!: Pipeline;

  @Expose()
  @Type(() => LaunchRequest)
  launchRequest!: LaunchRequest;

  @Expose()
  @Type(() => Environment)
  environment!: Environment;

  @Expose()
  @Type(() => RunScope)
  scope!: RunScope;

  @Expose()
  @Type(() => LaunchOptions)
  options!: LaunchOptions;

  @Expose()
  @Type(() => Project)
  project: Project;

  @Expose()
  @Type(() => String)
  parent: string;

  @Expose()
  @Type(() => String)
  comment: string;

  @Expose()
  @Type(() => String)
  errors: string[];

  @Expose()
  @Type(() => String)
  url: string;

  @Expose()
  @Transform(objectsMapTransformer(LaunchInput))
  inputs!: Map<string, LaunchInput>;

  @Expose()
  @Transform(objectsMapTransformer(LaunchOutput))
  outputs!: Map<string, LaunchOutput>;

  @Expose()
  @Type(() => PipelineCosts)
  costs: PipelineCosts;

  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<Launch> = {}) {
    assign(this, defs);
  }
}

export class LaunchState {
  @Expose()
  @Type(() => Date)
  launchedAt: Date;

  @Expose()
  @Type(() => String)
  errors!: string[];

  @Expose()
  @Transform(primitiveMapTransformer)
  outputs!: PrimitiveMap;

  @Expose()
  @Transform(multipleMapTransformer<OutputData>("type", OUTPUT_TYPES))
  results!: Map<string, OutputData>;

  constructor(defs: Partial<LaunchState> = {}) {
    assign(this, defs);
  }
}

export class LaunchData {
  @Expose()
  @Type(() => Date)
  launchedAt: Date;

  @Expose()
  @Type(() => String)
  errors!: string[];

  @Expose()
  @Transform(multipleMapTransformer<OutputData>("type", OUTPUT_TYPES))
  outputs!: Map<string, OutputData>;

  constructor(defs: Partial<LaunchData> = {}) {
    assign(this, defs);
  }
}
