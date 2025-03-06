import { Expose, Type } from "class-transformer";

export class BillingConfig {
  @Expose()
  @Type(() => String)
  url?: string;
}
