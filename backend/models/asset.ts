import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { User } from "./user";

export class Asset {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => User)
  createdBy: User;

  @Expose()
  @Type(() => String)
  project!: string;

  @Expose()
  @Type(() => String)
  folder!: string;

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

  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<Asset> = {}) {
    assign(this, defs);
  }
}
