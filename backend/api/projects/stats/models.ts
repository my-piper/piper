import {
  arrayTransformer,
  Expose,
  IsEnum,
  IsOptional,
  Transform,
} from "core-kit/packages/transform";
import { ArrayMaxSize, IsString } from "class-validator";
import assign from "lodash/assign";
import { STATS_PERIODS, StatsPeriod } from "models/project-stats";

const toPeriod = ({ value }: { value: unknown }) =>
  value === undefined ? value : Number(value);

export class ProjectStatsFilter {
  @IsOptional()
  @IsEnum(STATS_PERIODS)
  @Expose()
  @Transform(toPeriod)
  days?: StatsPeriod;

  constructor(defs: Partial<ProjectStatsFilter> = {}) {
    assign(this, defs);
  }
}

// a page of the projects list
export class ProjectsStatsFilter extends ProjectStatsFilter {
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  @Expose()
  @Transform(arrayTransformer<string>())
  projects?: string[];

  constructor(defs: Partial<ProjectsStatsFilter> = {}) {
    super();
    assign(this, defs);
  }
}
