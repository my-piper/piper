import { Expose, Type } from "class-transformer";
import { Length } from "class-validator";

export class AddBatchRequest {
  @Length(5, 20)
  @Expose()
  @Type(() => String)
  title!: string;
}
