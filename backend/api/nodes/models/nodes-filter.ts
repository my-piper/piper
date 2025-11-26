import { Expose, IsOptional, Type } from "core-kit/packages/transform";

export class NodesFilter {
  @IsOptional()
  @Expose()
  @Type(() => String)
  search: string;
}
