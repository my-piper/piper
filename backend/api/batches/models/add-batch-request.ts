import { Expose, Length, Type } from "core-kit/packages/transform";

export class AddBatchRequest {
  @Length(5, 20)
  @Expose()
  @Type(() => String)
  title!: string;
}
