import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";
import { Pipeline } from "src/models/pipeline";
import { PipelineIOType } from "src/types/pipeline";
import { LaunchRequest } from "./launch-request";
import { Project } from "./project";

export class LaunchesFilter {
  @Expose()
  @Type(() => String)
  parent?: string;

  @Expose()
  @Type(() => String)
  project?: string;

  @Expose()
  @Type(() => String)
  cursor?: string;

  constructor(defs: Partial<LaunchesFilter> = {}) {
    assign(this, defs);
  }
}

export class Launch {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => Date)
  launchedAt!: Date;

  @Expose()
  @Type(() => Date)
  startedAt!: Date;

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
  @Type(() => Pipeline)
  pipeline!: Pipeline;

  @Expose()
  @Type(() => LaunchRequest)
  launchRequest!: LaunchRequest;

  @Expose()
  @Type(() => LaunchArtefact)
  inputs!: Map<string, LaunchInput>;

  @Expose()
  @Type(() => LaunchArtefact)
  outputs!: Map<string, LaunchArtefact>;

  @Expose()
  @Type(() => String)
  cursor: string;
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
  @Type(() => Object)
  value: object;

  constructor(defs: Partial<StringData> = {}) {
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

export class LaunchInput {
  @Expose()
  @Type(() => String)
  _id: string;

  @Expose()
  @Type(() => String)
  title: string;

  @Expose()
  @Type(() => String)
  type: PipelineIOType;

  @Expose()
  @Type(() => OutputData, {
    discriminator: {
      property: "type",
      subTypes: [
        { value: BooleanData, name: "boolean" },
        { value: IntegerData, name: "integer" },
        { value: FloatData, name: "integer" },
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

  constructor(defs: Partial<LaunchArtefact> = {}) {
    assign(this, defs);
  }
}

export class LaunchArtefact {
  @Expose()
  @Type(() => String)
  _id: string;

  @Expose()
  @Type(() => String)
  title: string;

  @Expose()
  @Type(() => String)
  type: PipelineIOType;

  @Expose()
  @Type(() => OutputData, {
    discriminator: {
      property: "type",
      subTypes: [
        { value: BooleanData, name: "boolean" },
        { value: IntegerData, name: "integer" },
        { value: FloatData, name: "integer" },
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

  constructor(defs: Partial<LaunchArtefact> = {}) {
    assign(this, defs);
  }
}
