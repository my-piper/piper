import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import { User } from "./user";

export class AssetsFilter {
  @Expose()
  @Type(() => String)
  launch?: string;

  @Expose()
  @Type(() => String)
  project?: string;

  @Expose()
  @Type(() => String)
  type?: string;

  constructor(defs: Partial<AssetsFilter> = {}) {
    assign(this, defs);
  }
}

export class Asset {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => User)
  createdBy!: User;

  @Expose()
  @Type(() => String)
  type!: string;

  @Expose()
  @Type(() => String)
  format!: string;

  @Expose()
  @Type(() => Number)
  width!: number;

  @Expose()
  @Type(() => Number)
  height!: number;

  @Expose()
  @Type(() => String)
  url!: string;

  constructor(defs: Partial<Asset> = {}) {
    assign(this, defs);
  }
}

export class ImportAsset {
  @Expose()
  @Type(() => String)
  url?: string;

  @Expose()
  @Type(() => String)
  project?: string;

  constructor(defs: Partial<ImportAsset> = {}) {
    assign(this, defs);
  }
}
