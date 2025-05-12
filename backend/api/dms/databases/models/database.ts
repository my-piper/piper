import { Expose, Type } from "core-kit/packages/transform";

export class Database {
  @Expose()
  @Type(() => String)
  id!: string;

  @Expose()
  @Type(() => String)
  title!: string;
}

export class DatabaseList {
  @Expose()
  @Type(() => Database)
  list!: Database[];
}
