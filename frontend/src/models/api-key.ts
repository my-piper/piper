import { Expose, Type } from "class-transformer";

export class ApiKey {
  @Expose()
  @Type(() => String)
  hash!: string;
}
