import { Expose, IsOptional, Type } from "core-kit/packages/transform";

export class NodesFilter {
  @IsOptional()
  @Expose()
  @Type(() => String)
  search: string;

  /** Comma-separated input types: only nodes with an input of one of them. */
  @IsOptional()
  @Expose()
  @Type(() => String)
  accepts: string;
}
