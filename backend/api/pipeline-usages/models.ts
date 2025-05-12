import { Expose, IsOptional, Matches, Type } from "core-kit/packages/transform";

export class PipelineUsagesFilter {
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{26}$/)
  @Expose()
  @Type(() => String)
  cursor: string;
}
